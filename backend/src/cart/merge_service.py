"""
Idempotent guest-to-authenticated cart and wishlist merge service.

Merge policy:
  - For each guest cart item:
      * Validate product is active.
      * Validate stock covers total post-merge quantity.
      * Upsert into user's authenticated cart (existing_qty + guest_qty, capped to stock).
  - For each guest wishlist product:
      * Validate product is active.
      * INSERT IGNORE (idempotent — UniqueConstraint handles duplicates).
  - Write a GuestCartMergeReceipt.  A second request with the same
    (user_id, guest_cart_id) pair returns the cached result immediately
    without touching cart or wishlist data again.
  - Everything runs in a single database transaction.
"""

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.cart.schemas import CartItemOut, CartOut
from src.cart.service import CartService, _effective_max
from src.db.models import (
    Cart,
    CartItem,
    GuestCartMergeReceipt,
    Product,
    Vendor,
    Wishlist,
)
from src.wishlist.service import WishlistService
from src.wishlist.schemas import WishlistOut

from .merge_schemas import (
    GuestCartItemIn,
    GuestMergeRequest,
    GuestMergeResult,
    MergeConflict,
)

_cart_svc = CartService()
_wishlist_svc = WishlistService()


class GuestMergeService:
    async def merge(
        self,
        user_id: uuid.UUID,
        data: GuestMergeRequest,
        session: AsyncSession,
    ) -> GuestMergeResult:
        """
        Merge guest cart and wishlist into the authenticated user's account.
        Idempotent: a second call with the same guest_cart_id returns the
        same result without mutating data again.
        """
        now = datetime.now(timezone.utc)

        # ── Check for existing receipt (idempotency) ─────────────────────────
        receipt_result = await session.exec(
            select(GuestCartMergeReceipt).where(
                GuestCartMergeReceipt.user_id == user_id,
                GuestCartMergeReceipt.guest_cart_id == data.guest_cart_id,
            )
        )
        existing_receipt = receipt_result.first()
        if existing_receipt:
            # Return current cart/wishlist state and original conflicts (idempotent retry)
            cart_out = await _cart_svc.get_cart(user_id, session)
            wishlist_out = await _wishlist_svc.get_wishlist(user_id, session)
            cached_conflicts = []
            if getattr(existing_receipt, "conflicts_json", None):
                try:
                    raw_conflicts = json.loads(existing_receipt.conflicts_json)
                    cached_conflicts = [MergeConflict(**c) for c in raw_conflicts]
                except Exception:
                    cached_conflicts = []
            return GuestMergeResult(
                cart=cart_out,
                wishlist=wishlist_out,
                conflicts=cached_conflicts,
                merged_at=existing_receipt.merged_at,
                was_idempotent=True,
            )

        conflicts: list[MergeConflict] = []

        # ── Ensure the user has a cart row & acquire Cart lock first ────────
        cart = await _cart_svc._get_or_create_cart(user_id, session, for_update=True)

        # Re-check receipt under Cart lock so concurrent identical merge
        # requests return the exact cached conflicts rather than colliding.
        receipt_recheck = await session.exec(
            select(GuestCartMergeReceipt).where(
                GuestCartMergeReceipt.user_id == user_id,
                GuestCartMergeReceipt.guest_cart_id == data.guest_cart_id,
            )
        )
        existing_receipt = receipt_recheck.first()
        if existing_receipt:
            cart_out = await _cart_svc.get_cart(user_id, session)
            wishlist_out = await _wishlist_svc.get_wishlist(user_id, session)
            cached_conflicts = []
            if getattr(existing_receipt, "conflicts_json", None):
                try:
                    raw_conflicts = json.loads(existing_receipt.conflicts_json)
                    cached_conflicts = [MergeConflict(**c) for c in raw_conflicts]
                except Exception:
                    cached_conflicts = []
            return GuestMergeResult(
                cart=cart_out,
                wishlist=wishlist_out,
                conflicts=cached_conflicts,
                merged_at=existing_receipt.merged_at,
                was_idempotent=True,
            )

        # ── Deduplicate and sort cart items by product_id (deadlock-free) ────
        aggregated_cart: dict[uuid.UUID, int] = {}
        for guest_item in data.cart_items:
            aggregated_cart[guest_item.product_id] = min(
                99,
                aggregated_cart.get(guest_item.product_id, 0) + guest_item.quantity,
            )

        # ── Merge cart items ─────────────────────────────────────────────────
        for product_id in sorted(aggregated_cart.keys()):
            guest_qty = aggregated_cart[product_id]
            product = await self._get_active_product(
                product_id, session, for_update=True
            )
            if product is None:
                conflicts.append(
                    MergeConflict(
                        product_id=product_id,
                        reason="not_found",
                        requested_quantity=guest_qty,
                        applied_quantity=0,
                        message="Product not found or no longer available.",
                    )
                )
                continue

            effective_cap = _effective_max(product)
            if effective_cap <= 0:
                conflicts.append(
                    MergeConflict(
                        product_id=product_id,
                        reason="out_of_stock",
                        requested_quantity=guest_qty,
                        applied_quantity=0,
                        message=f"{product.title} is out of stock and was not added.",
                    )
                )
                continue

            # Look up and lock existing cart item for this user/product
            existing_item_result = await session.exec(
                select(CartItem)
                .where(
                    CartItem.cart_id == cart.uid,
                    CartItem.product_id == product.uid,
                )
                .with_for_update()
            )
            existing_item = existing_item_result.first()
            current_qty = existing_item.quantity if existing_item else 0
            desired_qty = current_qty + guest_qty
            applied_qty = min(desired_qty, effective_cap)

            if applied_qty < desired_qty:
                conflicts.append(
                    MergeConflict(
                        product_id=product.uid,
                        reason="quantity_capped",
                        requested_quantity=desired_qty,
                        applied_quantity=applied_qty,
                        message=(
                            f"{product.title}: maximum {effective_cap} allowed. "
                            f"Quantity adjusted from {desired_qty} to {applied_qty}."
                        ),
                    )
                )

            if existing_item:
                existing_item.quantity = applied_qty
                session.add(existing_item)
            else:
                session.add(
                    CartItem(
                        cart_id=cart.uid,
                        product_id=product.uid,
                        quantity=applied_qty,
                    )
                )

        # ── Merge wishlist items (deduplicated) ──────────────────────────────
        for product_id in dict.fromkeys(data.wishlist_product_ids):
            product = await self._get_active_product(product_id, session)
            if product is None:
                # Silently skip unavailable wishlist products (non-critical)
                continue
            # INSERT IGNORE semantics — UniqueConstraint on (user_id, product_id)
            existing_wl_result = await session.exec(
                select(Wishlist).where(
                    Wishlist.user_id == user_id,
                    Wishlist.product_id == product.uid,
                )
            )
            if not existing_wl_result.first():
                session.add(Wishlist(user_id=user_id, product_id=product.uid))

        # ── Write merge receipt with serialized conflicts ─────────────────────
        conflicts_payload = [c.model_dump(mode="json") for c in conflicts]
        receipt = GuestCartMergeReceipt(
            user_id=user_id,
            guest_cart_id=data.guest_cart_id,
            conflicts_json=json.dumps(conflicts_payload),
            merged_at=now,
        )
        session.add(receipt)

        try:
            await session.commit()
        except IntegrityError:
            # Race condition: another request with the same guest_cart_id
            # committed the receipt just ahead of this one.
            await session.rollback()
            cart_out = await _cart_svc.get_cart(user_id, session)
            wishlist_out = await _wishlist_svc.get_wishlist(user_id, session)
            return GuestMergeResult(
                cart=cart_out,
                wishlist=wishlist_out,
                conflicts=[],
                merged_at=now,
                was_idempotent=True,
            )

        # ── Return fresh cart + wishlist ─────────────────────────────────────
        cart_out = await _cart_svc.get_cart(user_id, session)
        wishlist_out = await _wishlist_svc.get_wishlist(user_id, session)

        return GuestMergeResult(
            cart=cart_out,
            wishlist=wishlist_out,
            conflicts=conflicts,
            merged_at=now,
            was_idempotent=False,
        )

    @staticmethod
    async def _get_active_product(
        product_id: uuid.UUID, session: AsyncSession, *, for_update: bool = False
    ) -> Product | None:
        stmt = select(Product).where(
            Product.uid == product_id,
            Product.status == "active",
        )
        if for_update:
            stmt = stmt.with_for_update()
        result = await session.exec(stmt)
        product = result.first()
        if not product:
            return None
        vendor_status_res = await session.exec(
            select(Vendor.status).where(Vendor.uid == product.vendor_id)
        )
        if vendor_status_res.first() != "approved":
            return None
        return product
