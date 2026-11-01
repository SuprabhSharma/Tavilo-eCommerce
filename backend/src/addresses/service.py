import uuid
from typing import List, Optional

from sqlalchemy import func, update
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.config import Config
from src.db.models import Address, User
from src.errors import AddressLimitReached

from .schemas import AddressCreate, AddressUpdate


class AddressService:
    async def get_all(self, user_id: uuid.UUID, session: AsyncSession) -> List[Address]:
        result = await session.exec(
            select(Address)
            .where(Address.user_id == user_id)
            .order_by(Address.is_default.desc(), Address.created_at.desc())
        )
        return result.all()

    async def _lock_user(self, user_id: uuid.UUID, session: AsyncSession) -> None:
        # The user row is the stable lock even when the user has no addresses.
        result = await session.exec(
            select(User.uid).where(User.uid == user_id).with_for_update()
        )
        if result.first() is None:
            raise RuntimeError("Authenticated user disappeared during address update")

    async def create(
        self, user_id: uuid.UUID, data: AddressCreate, session: AsyncSession
    ) -> Address:
        try:
            await self._lock_user(user_id, session)
            count_result = await session.exec(
                select(func.count()).select_from(Address).where(Address.user_id == user_id)
            )
            if count_result.one() >= Config.MAX_ADDRESSES_PER_USER:
                raise AddressLimitReached()

            existing_result = await session.exec(
                select(Address).where(Address.user_id == user_id).with_for_update()
            )
            existing = existing_result.all()
            should_be_default = data.is_default or not existing
            if should_be_default:
                await session.exec(
                    update(Address)
                    .where(Address.user_id == user_id, Address.is_default.is_(True))
                    .values(is_default=False)
                )
                await session.flush()

            address_data = data.model_dump()
            address_data["is_default"] = should_be_default
            address = Address(**address_data, user_id=user_id)
            session.add(address)
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            raise

        await session.refresh(address)
        return address

    async def update(
        self, uid: uuid.UUID, user_id: uuid.UUID, data: AddressUpdate, session: AsyncSession
    ) -> Optional[Address]:
        try:
            await self._lock_user(user_id, session)
            result = await session.exec(
                select(Address)
                .where(Address.uid == uid, Address.user_id == user_id)
                .with_for_update()
            )
            address = result.first()
            if address is None:
                return None

            # Excluding unset fields preserves PATCH semantics while retaining
            # an explicit null so clients can clear the optional line2 value.
            values = data.model_dump(exclude_unset=True)
            requested_default = values.pop("is_default", None)
            if requested_default is True:
                await session.exec(
                    update(Address)
                    .where(Address.user_id == user_id, Address.is_default.is_(True))
                    .values(is_default=False)
                )
                await session.flush()
                address.is_default = True
            elif requested_default is False and not address.is_default:
                address.is_default = False
            # A current default is never unset without atomically selecting another.

            for field, value in values.items():
                setattr(address, field, value)
            session.add(address)
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            raise

        await session.refresh(address)
        return address

    async def delete(self, uid: uuid.UUID, user_id: uuid.UUID, session: AsyncSession) -> bool:
        try:
            await self._lock_user(user_id, session)
            result = await session.exec(
                select(Address)
                .where(Address.uid == uid, Address.user_id == user_id)
                .with_for_update()
            )
            address = result.first()
            if address is None:
                return False

            was_default = address.is_default
            await session.delete(address)
            await session.flush()
            if was_default:
                successor_result = await session.exec(
                    select(Address)
                    .where(Address.user_id == user_id)
                    .order_by(Address.created_at.desc(), Address.uid.desc())
                    .with_for_update()
                )
                successor = successor_result.first()
                if successor is not None:
                    successor.is_default = True
                    session.add(successor)
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            raise
        return True