import uuid

from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.dependencies import get_verified_user
from src.db.main import get_session
from src.db.models import User

from .schemas import CartItemAdd, CartItemUpsert, CartItemUpdate, CartOut
from .service import CartService

cart_router = APIRouter()
service = CartService()


@cart_router.get("", response_model=CartOut)
async def get_cart(current_user: User = Depends(get_verified_user), session: AsyncSession = Depends(get_session)):
    return await service.get_cart(current_user.uid, session)


@cart_router.post("", response_model=CartOut)
async def add_to_cart(
    data: CartItemAdd,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    """Accumulate: increments quantity if product already in cart."""
    return await service.add_item(current_user.uid, data, session)


@cart_router.put("", response_model=CartOut)
async def upsert_cart_item(
    data: CartItemUpsert,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Idempotent upsert: sets quantity absolutely (no accumulation).
    Safe for Buy Now — repeated calls produce the same result.
    If product is already in cart the quantity is left unchanged (stays at
    whatever the user has selected in the cart) and the endpoint still
    returns 200 so the caller can navigate to checkout immediately.
    """
    return await service.upsert_item(current_user.uid, data, session)


@cart_router.patch("/{item_uid}", response_model=CartOut)
async def update_cart_item(
    item_uid: uuid.UUID,
    data: CartItemUpdate,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    return await service.update_item(current_user.uid, item_uid, data, session)


@cart_router.delete("/{item_uid}", response_model=CartOut)
async def remove_cart_item(
    item_uid: uuid.UUID,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    return await service.remove_item(current_user.uid, item_uid, session)
