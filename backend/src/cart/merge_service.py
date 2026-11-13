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
from src.cart.service import CartService
from src.db.models import (
    Cart,
    CartItem,
    GuestCartMergeReceipt,
    Product,
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

        # ── Ensure the user has a cart row ───────────────────────────────────
        cart = await _cart_svc._get_or_create_cart(user_id, session)

        # ── Merge cart items ─────────────────────────────────────────────────
        for guest_item in data.cart_items:
            product = await self._get_active_product(guest_item.product_id, session)
            if product is None:
                conflicts.append(
                    MergeConflict(
                        product_id=guest_item.product_id,
                        reason="not_found",
                        requested_quantity=guest_item.quantity,
                        applied_quantity=0,
                        message="Product not found or no longer available.",
                    )
                )
                continue

            if product.stock == 0:
                conflicts.append(
                    MergeConflict(
                        product_id=guest_item.product_id,
                        reason="out_of_stock",
                        requested_quantity=guest_item.quantity,
                        applied_quantity=0,
                        message=f"{product.title} is out of stock and was not added.",
                    )
                )
                continue

            # Look up existing cart item for this user/product
            existing_item_result = await session.exec(
                select(CartItem).where(
                    CartItem.cart_id == cart.uid,
                    CartItem.product_id == product.uid,
                )
            )
            existing_item = existing_item_result.first()
            current_qty = existing_item.quantity if existing_item else 0
            desired_qty = current_qty + guest_item.quantity
            applied_qty = min(desired_qty, product.stock)

            if applied_qty < desired_qty:
                conflicts.append(
                    MergeConflict(
                        product_id=product.uid,
                        reason="quantity_capped",
                        requested_quantity=desired_qty,
                        applied_quantity=applied_qty,
                        message=(
                            f"{product.title}: only {product.stock} in stock. "
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

        # ── Merge wishlist items ─────────────────────────────────────────────
        for product_id in data.wishlist_product_ids:
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
        product_id: uuid.UUID, session: AsyncSession
    ) -> Product | None:
        result = await session.exec(
            select(Product).where(
                Product.uid == product_id,
                Product.status == "active",
            )
        )
        return result.first()
