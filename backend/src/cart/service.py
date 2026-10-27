import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import Cart, CartItem, Product
from src.errors import ProductNotFound

from .schemas import CartItemAdd, CartItemUpdate, CartItemOut, CartOut


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
        await session.refresh(cart)
        items_out = []
        subtotal = Decimal("0.00")
        for item in cart.items:
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
        cart = await self._get_or_create_cart(user_id, session)
        # verify product exists and is active
        p_result = await session.exec(select(Product).where(Product.uid == data.product_id, Product.status == "active"))
        product = p_result.first()
        if not product:
            raise ProductNotFound()
        if product.stock < data.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for: {product.title}")
        # Upsert: if the product is already in the cart, accumulate quantity;
        # Bug 8 fix: existing item was silently ignored -- now quantity is incremented.
        item_result = await session.exec(
            select(CartItem).where(CartItem.cart_id == cart.uid, CartItem.product_id == data.product_id)
        )
        item = item_result.first()
        if item:
            new_qty = item.quantity + data.quantity
            if product.stock < new_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for: {product.title} (requested total: {new_qty}, available: {product.stock})",
                )
            item.quantity = new_qty
            session.add(item)
        else:
            item = CartItem(cart_id=cart.uid, product_id=data.product_id, quantity=data.quantity)
            session.add(item)
        await session.commit()
        return await self.get_cart(user_id, session)

    async def update_item(self, user_id: uuid.UUID, item_uid: uuid.UUID, data: CartItemUpdate, session: AsyncSession) -> CartOut:
        cart = await self._get_or_create_cart(user_id, session)
        item_result = await session.exec(select(CartItem).where(CartItem.uid == item_uid, CartItem.cart_id == cart.uid))
        item = item_result.first()
        if not item:
            raise ProductNotFound()
        product_result = await session.exec(
            select(Product).where(Product.uid == item.product_id, Product.status == "active")
        )
        product = product_result.first()
        if not product:
            raise ProductNotFound()
        if product.stock < data.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for: {product.title}")
        item.quantity = data.quantity
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
