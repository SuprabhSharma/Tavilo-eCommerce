import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.dependencies import AccessTokenBearer, RoleChecker, get_verified_user
from src.db.main import get_session
from src.db.models import User, Vendor
from src.errors import InsufficientPermission, ProductNotFound, VendorNotFound

from .schemas import ProductCreate, ProductListOut, ProductOut, ProductUpdate
from .service import ProductService
from .image_storage import save_product_images

product_router = APIRouter()
service = ProductService()


async def get_approved_vendor(current_user: User = Depends(get_verified_user), session: AsyncSession = Depends(get_session)) -> Vendor:
    from sqlmodel import select
    result = await session.exec(select(Vendor).where(Vendor.user_id == current_user.uid, Vendor.status == "approved"))
    vendor = result.first()
    if not vendor:
        raise VendorNotFound()
    return vendor


# ── Public endpoints ──────────────────────────────────────────────────────────

@product_router.get("", response_model=ProductListOut)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    vendor: str | None = Query(None),
    q: str | None = Query(None, min_length=1, max_length=100),
    min_price: Decimal | None = Query(None),
    max_price: Decimal | None = Query(None),
    in_stock: bool | None = Query(None),
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc|rating)$"),
    session: AsyncSession = Depends(get_session),
):
    return await service.get_all(
        session,
        page=page,
        page_size=page_size,
        category_slug=category,
        vendor_slug=vendor,
        query=q,
        min_price=min_price,
        max_price=max_price,
        in_stock=in_stock,
        sort=sort,
    )


@product_router.get("/slug/{slug}", response_model=ProductOut)
async def get_product(slug: str, session: AsyncSession = Depends(get_session)):
    product = await service.get_by_slug(slug, session)
    if not product:
        raise ProductNotFound()
    return product


# ── Vendor endpoints ──────────────────────────────────────────────────────────

@product_router.get("/vendor/me", response_model=ProductListOut)
async def vendor_list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    vendor: Vendor = Depends(get_approved_vendor),
    session: AsyncSession = Depends(get_session),
):
    return await service.get_vendor_products(vendor.uid, session, page=page, page_size=page_size)


@product_router.post("/vendor/me/images")
async def vendor_upload_product_images(
    files: list[UploadFile] = File(...),
    vendor: Vendor = Depends(get_approved_vendor),
):
    del vendor
    return {"images": await save_product_images(files)}


@product_router.post("/vendor/me", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def vendor_create_product(
    data: ProductCreate,
    vendor: Vendor = Depends(get_approved_vendor),
    session: AsyncSession = Depends(get_session),
):
    return await service.create(vendor.uid, data, session)


@product_router.patch("/vendor/me/{uid}", response_model=ProductOut)
async def vendor_update_product(
    uid: uuid.UUID,
    data: ProductUpdate,
    vendor: Vendor = Depends(get_approved_vendor),
    session: AsyncSession = Depends(get_session),
):
    product = await service.get_by_id(uid, session)
    if not product:
        raise ProductNotFound()
    if product.vendor_id != vendor.uid:
        raise InsufficientPermission()
    return await service.update(product, data, session)


@product_router.delete("/vendor/me/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def vendor_delete_product(
    uid: uuid.UUID,
    vendor: Vendor = Depends(get_approved_vendor),
    session: AsyncSession = Depends(get_session),
):
    product = await service.get_by_id(uid, session)
    if not product:
        raise ProductNotFound()
    if product.vendor_id != vendor.uid:
        raise InsufficientPermission()
    await service.delete(product, session)
