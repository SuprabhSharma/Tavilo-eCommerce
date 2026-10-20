import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.audit import record_audit
from src.auth.dependencies import RoleChecker, get_current_user
from src.db.main import get_session
from src.db.models import Order, Product, User, Vendor
from src.errors import UserNotFound

admin_router = APIRouter()
admin_dep = Depends(RoleChecker(["admin"]))


@admin_router.get("/stats", dependencies=[admin_dep])
async def get_stats(session: AsyncSession = Depends(get_session)):
    """High-level dashboard stats."""
    user_count = (await session.exec(select(func.count(User.uid)))).one()
    vendor_count = (await session.exec(select(func.count(Vendor.uid)).where(Vendor.status == "approved"))).one()
    product_count = (await session.exec(select(func.count(Product.uid)).where(Product.status == "active"))).one()
    order_count = (await session.exec(select(func.count(Order.uid)))).one()
    revenue = (await session.exec(select(func.coalesce(func.sum(Order.total), 0)))).one()
    return {
        "users": user_count,
        "vendors": vendor_count,
        "products": product_count,
        "orders": order_count,
        "revenue": float(revenue),
    }


@admin_router.get("/users", dependencies=[admin_dep])
async def list_users(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(User))
    users = result.all()
    return [{"uid": str(u.uid), "email": u.email, "username": u.username, "role": u.role, "is_verified": u.is_verified} for u in users]


@admin_router.patch("/users/{uid}/role")
async def set_user_role(
    uid: uuid.UUID,
    role: str = Query(pattern="^(customer|vendor|admin)$"),
    current_user: User = Depends(RoleChecker(["admin"])),
    session: AsyncSession = Depends(get_session),
):
    # Becoming a vendor is a state transition owned by the approval flow.  A
    # bare role assignment would create an account with seller access but no
    # approved store, and changing any role on a vendor would break that pair.
    if role == "vendor":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Use the vendor approval workflow to grant vendor access.",
        )
    if uid == current_user.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators cannot change their own role.",
        )

    result = await session.exec(select(User).where(User.uid == uid).with_for_update())
    user = result.first()
    if not user:
        raise UserNotFound()

    vendor = (
        await session.exec(select(Vendor).where(Vendor.user_id == user.uid))
    ).first()
    if vendor:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vendor account roles are managed only through vendor approval and suspension.",
        )

    if user.role == role:
        return {"uid": str(user.uid), "role": user.role}

    user.role = role
    user.session_version += 1
    await record_audit(
        session,
        "admin.role_changed",
        actor_user_id=current_user.uid,
        target_type="user",
        target_id=str(user.uid),
        metadata={"role": role},
    )
    await session.commit()
    return {"uid": str(user.uid), "role": user.role}
