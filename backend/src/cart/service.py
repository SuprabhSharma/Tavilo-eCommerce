import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import Cart, CartItem, Product
from src.errors import ProductNotFound

from .schemas import CartItemAdd, CartItemUpdate, CartItemUpsert, CartItemOut, CartOut


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _effective_max(product: Product) -> int:
    """
    The maximum qty a customer may hold in their cart for this product.
    = min(real stock, vendor's max_order_qty cap).

    Matches Flipkart/Amazon behaviour:
      - Some products have a vendor cap (e.g. 5) independent of stock.
      - When stock < cap, stock is the binding limit.
      - When cap is NULL, only stock matters.
    """
    if product.max_order_qty is not None:
        return min(product.stock, product.max_order_qty)
    return product.stock


def _max_qty_error(product: Product) -> HTTPException:
    """
    Returns the user-facing 400 when the cart quantity hits its ceiling.
    Message mirrors Flipkart/Amazon: "You can add maximum of N for this product."
    """
    cap = _effective_max(product)
    return HTTPException(
        status_code=400,
        detail=f"You can add maximum of {cap} for this product",
    )


class CartService:
    async def _get_or_create_cart(self, user_id: uuid.UUID, session: AsyncSession) -> Cart:
        result = await session.exec(select(Cart).where(Cart.user_id == user_id))
        cart = result.first()
        if not cart:
            cart = Cart(user_id=user_id)
            session.add(cart)
            await session.flush()
        return cart

    async def get_cart(self, user_id: uuid.UUID, session: AsyncSession) -> CartOut:
        cart = await self._get_or_create_cart(user_id, session)
        # Deterministic descending ordering by created_at:
        # Most recently added product is always at the top.
        # Quantity updates (+/-) do not modify created_at, preventing any position jumping.
        items_result = await session.exec(
            select(CartItem)
            .where(CartItem.cart_id == cart.uid)
            .order_by(CartItem.created_at.desc(), CartItem.uid.desc())
        )
        cart_items = items_result.all()
        items_out = []
        subtotal = Decimal("0.00")
        for item in cart_items:
            if item.product:
                line = Decimal(str(item.product.price)) * item.quantity
                subtotal += line
                items_out.append(CartItemOut(
                    uid=item.uid,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    unit_price=item.product.price,
                    line_total=line,
                    product_title=item.product.title,
                    product=item.product,
                ))
        return CartOut(uid=cart.uid, items=items_out, subtotal=subtotal)

    async def add_item(self, user_id: uuid.UUID, data: CartItemAdd, session: AsyncSession) -> CartOut:
        """
        Accumulate: POST /cart — increments quantity if already in cart.
        Uses SELECT FOR UPDATE on both Product and CartItem to prevent
        concurrent qty drift (zero race condition).
        """
        cart = await self._get_or_create_cart(user_id, session)

        # Pessimistic row-level lock on product — authoritative stock + cap read.
        p_result = await session.exec(
            select(Product)
            .where(Product.uid == data.product_id, Product.status == "active")
            .with_for_update()
        )
        product = p_result.first()
        if not product:
            raise ProductNotFound()

        effective_cap = _effective_max(product)

        # Reject if the requested qty alone already exceeds the cap.
        if data.quantity > effective_cap:
            raise _max_qty_error(product)

        # Pessimistic row-level lock on CartItem — prevents double-increment.
        item_result = await session.exec(
            select(CartItem)
            .where(CartItem.cart_id == cart.uid, CartItem.product_id == data.product_id)
            .with_for_update()
        )
        item = item_result.first()
        if item:
            new_qty = item.quantity + data.quantity
            if new_qty > effective_cap:
                raise _max_qty_error(product)
            item.quantity = new_qty
            # When newly re-added from product detail, bring to top as most recent
            item.created_at = datetime.now(timezone.utc)
            session.add(item)
        else:
            item = CartItem(
                cart_id=cart.uid,
                product_id=data.product_id,
                quantity=data.quantity,
                created_at=datetime.now(timezone.utc),
            )
            session.add(item)
        await session.commit()
        return await self.get_cart(user_id, session)

    async def upsert_item(self, user_id: uuid.UUID, data: CartItemUpsert, session: AsyncSession) -> CartOut:
        """
        Idempotent upsert: PUT /cart — ensures the product is in the cart.
        - If NOT in cart: adds it with quantity=data.quantity.
        - If ALREADY in cart: does NOT change the quantity (Flipkart model —
          the user's existing cart quantity is authoritative; Buy Now just
          needs to ensure the item is present, then navigate to checkout).
        Uses SELECT FOR UPDATE to prevent concurrent race conditions.
        """
        cart = await self._get_or_create_cart(user_id, session)

        # Row-level lock on product for authoritative stock + cap check.
        p_result = await session.exec(
            select(Product)
            .where(Product.uid == data.product_id, Product.status == "active")
            .with_for_update()
        )
        product = p_result.first()
        if not product:
            raise ProductNotFound()

        effective_cap = _effective_max(product)
        if data.quantity > effective_cap:
            raise _max_qty_error(product)

        # Row-level lock on CartItem.
        item_result = await session.exec(
            select(CartItem)
            .where(CartItem.cart_id == cart.uid, CartItem.product_id == data.product_id)
            .with_for_update()
        )
        item = item_result.first()
        if item:
            # Already in cart — preserve the existing quantity entirely.
            pass
        else:
            item = CartItem(
                cart_id=cart.uid,
                product_id=data.product_id,
                quantity=data.quantity,
                created_at=datetime.now(timezone.utc),
            )
            session.add(item)
        await session.commit()
        return await self.get_cart(user_id, session)

    async def update_item(self, user_id: uuid.UUID, item_uid: uuid.UUID, data: CartItemUpdate, session: AsyncSession) -> CartOut:
        """
        PATCH /cart/{item_uid} — sets an absolute quantity.
        Locks both CartItem AND Product (in that order, consistent with
        checkout's lock ordering) to prevent race conditions when multiple
        tabs or concurrent requests update the same cart item.

        CRITICAL: Does NOT modify created_at, so increasing or decreasing
        product quantity NEVER changes the item's location/order in the cart!
        """
        cart = await self._get_or_create_cart(user_id, session)

        # Lock CartItem first (narrower scope).
        item_result = await session.exec(
            select(CartItem)
            .where(CartItem.uid == item_uid, CartItem.cart_id == cart.uid)
            .with_for_update()
        )
        item = item_result.first()
        if not item:
            raise ProductNotFound()

        # Lock Product to get authoritative stock + cap (prevents TOCTOU).
        product_result = await session.exec(
            select(Product)
            .where(Product.uid == item.product_id, Product.status == "active")
            .with_for_update()
        )
        product = product_result.first()
        if not product:
            raise ProductNotFound()

        effective_cap = _effective_max(product)
        if data.quantity > effective_cap:
            raise _max_qty_error(product)

        item.quantity = data.quantity
        session.add(item)
        await session.commit()
        return await self.get_cart(user_id, session)

    async def remove_item(self, user_id: uuid.UUID, item_uid: uuid.UUID, session: AsyncSession) -> CartOut:
        cart = await self._get_or_create_cart(user_id, session)
        item_result = await session.exec(select(CartItem).where(CartItem.uid == item_uid, CartItem.cart_id == cart.uid))
        item = item_result.first()
        if item:
            await session.delete(item)
            await session.commit()
        return await self.get_cart(user_id, session)

