import uuid

from fastapi import APIRouter, Depends, status
from src.audit import record_audit
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.dependencies import RoleChecker, get_verified_user
from src.db.main import get_session
from src.db.models import User
from src.errors import InsufficientPermission, VendorNotFound

from .schemas import VendorApply, VendorOut, VendorUpdate
from .service import VendorService

vendor_router = APIRouter()
service = VendorService()

admin_only = Depends(RoleChecker(["admin"]))


# ── Authenticated: apply ──────────────────────────────────────────────────────

@vendor_router.post("/apply", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def apply_as_vendor(
    data: VendorApply,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    from src.errors import VendorAlreadyExists
    if current_user.role != "customer":
        raise VendorAlreadyExists()
    existing = await service.get_by_user_id(current_user.uid, session)
    if existing:
        raise VendorAlreadyExists()
    return await service.apply(current_user.uid, data, session)


# ── Vendor: own profile ───────────────────────────────────────────────────────

@vendor_router.get("/me/profile", response_model=VendorOut)
async def get_my_profile(
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    vendor = await service.get_by_user_id(current_user.uid, session)
    if not vendor:
        raise VendorNotFound()
    return vendor


@vendor_router.patch("/me/profile", response_model=VendorOut)
async def update_my_profile(
    data: VendorUpdate,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    vendor = await service.get_by_user_id(current_user.uid, session)
    if not vendor:
        raise VendorNotFound()
    return await service.update(vendor, data, session)


# ── Admin: approvals ──────────────────────────────────────────────────────────

@vendor_router.get("/admin/pending", response_model=list[VendorOut], dependencies=[admin_only])
async def list_pending_vendors(session: AsyncSession = Depends(get_session)):
    return await service.get_all_pending(session)


@vendor_router.patch("/admin/{uid}/approve", response_model=VendorOut)
async def approve_vendor(
    uid: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin"])),
    session: AsyncSession = Depends(get_session),
):
    vendor = await service.get_by_id(uid, session)
    if not vendor:
        raise VendorNotFound()
    result = await service.set_status(vendor, "approved", session)
    await record_audit(session, "admin.vendor_approved", current_user.uid, "vendor", str(uid))
    await session.commit()
    await session.refresh(result)
    return result


@vendor_router.patch("/admin/{uid}/suspend", response_model=VendorOut)
async def suspend_vendor(
    uid: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin"])),
    session: AsyncSession = Depends(get_session),
):
    vendor = await service.get_by_id(uid, session)
    if not vendor:
        raise VendorNotFound()
    result = await service.set_status(vendor, "suspended", session)
    await record_audit(session, "admin.vendor_suspended", current_user.uid, "vendor", str(uid))
    await session.commit()
    await session.refresh(result)
    return result


# ── Public ────────────────────────────────────────────────────────────────────

# Keep the parameterized storefront route after the fixed management routes.
# Otherwise paths such as /apply and /me/profile can be consumed as slugs.
@vendor_router.get("/{slug}", response_model=VendorOut)
async def get_vendor_storefront(slug: str, session: AsyncSession = Depends(get_session)):
    vendor = await service.get_by_slug(slug, session)
    if not vendor:
        raise VendorNotFound()
    return vendor
