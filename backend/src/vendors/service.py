import base64
import binascii
import hashlib
import json
import uuid
from typing import Optional

from sqlmodel import select
from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import User, Vendor
from src.errors import InsufficientPermission, UserNotFound

from .schemas import VendorApply, VendorListOut, VendorUpdate


class VendorService:
    _CURSOR_VERSION = 1

    @staticmethod
    def _cursor_fingerprint(query: str) -> str:
        return hashlib.sha256(query.encode("utf-8")).hexdigest()[:16]

    @classmethod
    def _encode_cursor(cls, vendor: Vendor, query: str) -> str:
        payload = {"v": cls._CURSOR_VERSION, "f": cls._cursor_fingerprint(query), "p": [vendor.store_name, str(vendor.uid)]}
        return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii").rstrip("=")

    @classmethod
    def _decode_cursor(cls, cursor: str, query: str) -> tuple[str, uuid.UUID]:
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
            position = payload.get("p")
            if payload.get("v") != cls._CURSOR_VERSION or payload.get("f") != cls._cursor_fingerprint(query) or not isinstance(position, list) or len(position) != 2 or not isinstance(position[0], str):
                raise ValueError
            return position[0], uuid.UUID(position[1])
        except (AttributeError, TypeError, ValueError, KeyError, binascii.Error, json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid or expired pagination cursor.") from None

    async def list_approved(
        self, session: AsyncSession, limit: int, query: str | None = None, cursor: str | None = None
    ) -> VendorListOut:
        """Public storefront directory; never exposes pending or suspended stores."""
        statement = select(Vendor).where(Vendor.status == "approved")
        clean_query = query.strip() if query else ""
        if clean_query:
            # Escape LIKE wildcards so a user query is always interpreted as
            # text, while PostgreSQL's pg_trgm indexes keep substring search fast.
            escaped = clean_query.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            pattern = f"%{escaped}%"
            statement = statement.where(
                Vendor.store_name.ilike(pattern, escape="!")
                | Vendor.slug.ilike(pattern, escape="!")
            )
        if cursor:
            name, uid = self._decode_cursor(cursor, clean_query)
            statement = statement.where(or_(Vendor.store_name > name, and_(Vendor.store_name == name, Vendor.uid > uid)))
        result = await session.exec(statement.order_by(Vendor.store_name.asc(), Vendor.uid.asc()).limit(limit + 1))
        rows = list(result.all())
        has_more = len(rows) > limit
        rows = rows[:limit]
        return VendorListOut(items=rows, has_more=has_more, next_cursor=self._encode_cursor(rows[-1], clean_query) if has_more else None)

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
