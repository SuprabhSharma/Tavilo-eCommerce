import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.dependencies import get_verified_user
from src.db.main import get_session
from src.db.models import User
from src.errors import AddressNotFound

from .schemas import AddressCreate, AddressOut, AddressUpdate
from .service import AddressService

address_router = APIRouter()
service = AddressService()


@address_router.get("", response_model=List[AddressOut])
async def list_addresses(
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    return await service.get_all(current_user.uid, session)


@address_router.post("", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
async def create_address(
    data: AddressCreate,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    return await service.create(current_user.uid, data, session)


@address_router.patch("/{uid}", response_model=AddressOut)
async def update_address(
    uid: uuid.UUID,
    data: AddressUpdate,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    address = await service.update(uid, current_user.uid, data, session)
    if address is None:
        raise AddressNotFound()
    return address


@address_router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    uid: uuid.UUID,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    if not await service.delete(uid, current_user.uid, session):
        raise AddressNotFound()