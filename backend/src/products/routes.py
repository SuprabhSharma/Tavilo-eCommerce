import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.client_ip import get_client_ip
from src.auth.dependencies import RoleChecker, get_verified_user
from src.auth.rate_limit import check_catalog_rate
from src.db.main import get_session
from src.db.models import Product, ProductImage, User, Vendor
from src.errors import InsufficientPermission, ProductNotFound, VendorNotFound

from .schemas import (
    ProductCreate,
    ProductListOut,
    ProductOut,
    ProductPublicOut,
    ProductUpdate,
    VendorProductListOut,
    VendorProductSummaryOut,
)
from .service import ProductService
from .image_storage import (
    IMAGE_URL_PREFIX,
    PRODUCT_IMAGE_DIR,
    canonical_image_url,
    get_image_filename,
    save_product_images,
    staged_image_url,
    verify_image_access_token,
)

product_router = APIRouter()
service = ProductService()


async def _catalog_rate_check(request: Request) -> None:
    """120 requests/min per IP — blocks scrapers, keeps legit users unaffected."""
    ip = get_client_ip(request)
    allowed, retry_after = await check_catalog_rate(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please slow down.",
            headers={"Retry-After": str(retry_after)},
        )


async def get_approved_vendor(current_user: User = Depends(get_verified_user), session: AsyncSession = Depends(get_session)) -> Vendor:
    # An approved store alone is not authority.  The account must currently be
    # in the vendor role as well, so a suspension/demotion immediately removes
    # product, service, and fulfilment privileges.
    if current_user.role != "vendor":
        raise InsufficientPermission()
    result = await session.exec(select(Vendor).where(Vendor.user_id == current_user.uid, Vendor.status == "approved"))
    vendor = result.first()
    if not vendor:
        raise VendorNotFound()
    return vendor


# ── Public endpoints ──────────────────────────────────────────────────────────

@product_router.get("", response_model=ProductListOut)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    category: str | None = Query(None),
    vendor: str | None = Query(None),
    q: str | None = Query(None, min_length=1, max_length=100),
    ids: str | None = Query(None, description="Comma-separated product UUIDs"),
    min_price: Decimal | None = Query(None),
    max_price: Decimal | None = Query(None),
    in_stock: bool | None = Query(None),
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc|rating)$"),
    response: Response = None,
    session: AsyncSession = Depends(get_session),
    _rate: None = Depends(_catalog_rate_check),
):
    result = await service.get_all(
        session,
        page=page,
        page_size=page_size,
        category_slug=category,
        vendor_slug=vendor,
        query=q,
        ids=ids,
        min_price=min_price,
        max_price=max_price,
        in_stock=in_stock,
        sort=sort,
    )
    if response is not None:
        response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=120"
    return result


@product_router.get("/slug/{slug}", response_model=ProductPublicOut)
async def get_product(
    slug: str,
    response: Response,
    session: AsyncSession = Depends(get_session),
    _rate: None = Depends(_catalog_rate_check),
):
    product = await service.get_by_slug(slug, session)
    if not product:
        raise ProductNotFound()
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return product


@product_router.get("/images/{filename}")
async def serve_product_image(
    filename: str,
    token: str | None = Query(None, min_length=1, max_length=512),
    session: AsyncSession = Depends(get_session),
):
    """Serve only published images or short-lived vendor-authorized previews.

    The upload directory is intentionally not mounted as a public StaticFiles
    directory. A random filename alone is never enough to read an image.
    """
    safe_filename = get_image_filename(f"{IMAGE_URL_PREFIX}{filename}")
    if safe_filename != filename:
        raise ProductNotFound()
    path = PRODUCT_IMAGE_DIR / safe_filename
    if not path.is_file():
        raise ProductNotFound()

    result = await session.exec(
        select(ProductImage)
        .join(Product, ProductImage.product_id == Product.uid)
        .join(Vendor, Product.vendor_id == Vendor.uid)
        .where(ProductImage.url.in_([canonical_image_url(filename), f"/media/products/{filename}"]))
    )
    image = result.first()
    is_published = bool(
        image
        and image.product
        and image.product.status == "active"
        and image.product.vendor
        and image.product.vendor.status == "approved"
    )
    if not is_published and not verify_image_access_token(token, filename):
        raise ProductNotFound()

    headers = {
        "Cache-Control": "public, max-age=31536000, immutable"
        if is_published
        else "private, no-store"
    }
    return FileResponse(path, media_type="image/webp", headers=headers)


# ── Vendor endpoints ──────────────────────────────────────────────────────────

@product_router.get("/vendor/me/summary", response_model=VendorProductSummaryOut)
async def vendor_products_summary(
    vendor: Vendor = Depends(get_approved_vendor),
    session: AsyncSession = Depends(get_session),
):
    return await service.get_vendor_summary(vendor.uid, session)


@product_router.get("/vendor/me", response_model=VendorProductListOut)
async def vendor_list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None),
    vendor: Vendor = Depends(get_approved_vendor),
    session: AsyncSession = Depends(get_session),
):
    payload = await service.get_vendor_products(vendor.uid, session, page=page, page_size=page_size, query=q)
    for product in payload.items:
        for image in product.images:
            filename = get_image_filename(image.url)
            if filename:
                image.url = staged_image_url(filename, vendor.uid)
    return payload


@product_router.post("/vendor/me/images")
async def vendor_upload_product_images(
    files: list[UploadFile] = File(...),
    vendor: Vendor = Depends(get_approved_vendor),
):
    return {"images": await save_product_images(files, vendor.uid)}


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
