import uuid
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import User, Vendor
from src.errors import InsufficientPermission, UserNotFound

from .schemas import VendorApply, VendorUpdate


class VendorService:
    async def get_by_slug(self, slug: str, session: AsyncSession) -> Optional[Vendor]:
        result = await session.exec(select(Vendor).where(Vendor.slug == slug.strip().lower(), Vendor.status == "approved"))
        return result.first()

    async def get_by_slug_any(self, slug: str, session: AsyncSession) -> Optional[Vendor]:
        result = await session.exec(select(Vendor).where(Vendor.slug == slug.strip().lower()))
        return result.first()

    async def get_by_id(self, uid: uuid.UUID, session: AsyncSession) -> Optional[Vendor]:
        result = await session.exec(select(Vendor).where(Vendor.uid == uid))
        return result.first()

    async def get_by_user_id(self, user_id: uuid.UUID, session: AsyncSession) -> Optional[Vendor]:
        result = await session.exec(select(Vendor).where(Vendor.user_id == user_id))
        return result.first()

    async def get_all_pending(self, session: AsyncSession):
        result = await session.exec(select(Vendor).where(Vendor.status == "pending"))
        return result.all()

    async def apply(self, user_id: uuid.UUID, data: VendorApply, session: AsyncSession) -> Vendor:
        from src.errors import VendorAlreadyExists, VendorSlugAlreadyExists
        user_result = await session.exec(
            select(User).where(User.uid == user_id).with_for_update()
        )
        user = user_result.first()
        if not user:
            raise UserNotFound()
        if user.role != "customer":
            raise InsufficientPermission()

        existing_vendor = await self.get_by_user_id(user_id, session)
        if existing_vendor:
            raise VendorAlreadyExists()

        clean_slug = data.slug.strip().lower()
        slug_conflict = await self.get_by_slug_any(clean_slug, session)
        if slug_conflict:
            raise VendorSlugAlreadyExists()

        payload = data.model_dump()
        payload["store_name"] = data.store_name.strip()
        payload["slug"] = clean_slug
        vendor = Vendor(**payload, user_id=user_id, status="pending")
        session.add(vendor)
        await session.commit()
        await session.refresh(vendor)
        return vendor

    async def update(self, vendor: Vendor, data: VendorUpdate, session: AsyncSession) -> Vendor:
        updates = data.model_dump(exclude_none=True)
        if "store_name" in updates:
            clean_name = updates["store_name"].strip()
            if not clean_name:
                from fastapi import HTTPException
                raise HTTPException(status_code=422, detail="Store name cannot be empty")
            updates["store_name"] = clean_name
        for k, v in updates.items():
            setattr(vendor, k, v)
        await session.commit()
        await session.refresh(vendor)
        return vendor

    async def set_status(self, vendor: Vendor, status: str, session: AsyncSession) -> Vendor:
        if status not in {"approved", "suspended"}:
            raise ValueError("Unsupported vendor status transition")

        # Lock the account while changing the coupled vendor/status state.
        # The deferred database constraint independently enforces the same
        # invariant for every writer, including direct SQL jobs.
        user_result = await session.exec(
            select(User).where(User.uid == vendor.user_id).with_for_update()
        )
        user = user_result.first()
        if not user:
            raise RuntimeError("Vendor is missing its user account")
        if user.role == "admin":
            from fastapi import HTTPException, status as http_status

            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail="An administrator cannot own a vendor profile.",
            )

        vendor.status = status
        next_role = "vendor" if status == "approved" else "customer"
        if user.role != next_role:
            user.role = next_role
            user.session_version += 1
        await session.flush()
        return vendor
