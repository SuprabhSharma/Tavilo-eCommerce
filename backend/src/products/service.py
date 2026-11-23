import base64
import binascii
import hashlib
import json
import math
import uuid
from copy import copy
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from urllib.parse import parse_qs, urlsplit

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import Category, Product, ProductImage, Vendor

from .image_storage import (
    MAX_PRODUCT_IMAGES,
    PRODUCT_IMAGE_DIR,
    canonical_image_url,
    get_image_filename,
    is_local_product_image_available,
    verify_image_access_token,
)
from .schemas import (
    ProductCreate,
    ProductListOut,
    ProductOut,
    ProductUpdate,
    VendorProductListOut,
    VendorProductSummaryOut,
)


class ProductService:
    """Product queries with keyset pagination as the scalable default."""

    _CURSOR_VERSION = 1

    @staticmethod
    def _escape_like(value: str) -> str:
        """Treat user search text literally; % and _ must not widen a query."""
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_")

    @staticmethod
    def _cursor_fingerprint(**filters: object) -> str:
        canonical = json.dumps(filters, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]

    @classmethod
    def _encode_cursor(cls, *, sort: str, fingerprint: str, product: Product) -> str:
        if sort == "newest":
            position = [product.created_at.isoformat(), str(product.uid)]
        elif sort in {"price_asc", "price_desc"}:
            position = [str(product.price), str(product.uid)]
        else:
            position = [str(product.rating_avg), product.created_at.isoformat(), str(product.uid)]
        payload = {"v": cls._CURSOR_VERSION, "s": sort, "f": fingerprint, "p": position}
        encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        return encoded.decode("ascii").rstrip("=")

    @classmethod
    def _decode_cursor(cls, cursor: str, *, sort: str, fingerprint: str) -> list[object]:
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
            if (payload.get("v") != cls._CURSOR_VERSION or payload.get("s") != sort
                    or payload.get("f") != fingerprint or not isinstance(payload.get("p"), list)):
                raise ValueError
            position = payload["p"]
            if sort == "newest" and len(position) == 2:
                return [datetime.fromisoformat(position[0]), uuid.UUID(position[1])]
            if sort in {"price_asc", "price_desc"} and len(position) == 2:
                return [Decimal(position[0]), uuid.UUID(position[1])]
            if sort == "rating" and len(position) == 3:
                return [Decimal(position[0]), datetime.fromisoformat(position[1]), uuid.UUID(position[2])]
        except (AttributeError, TypeError, ValueError, KeyError, binascii.Error, json.JSONDecodeError, UnicodeDecodeError):
            pass
        raise HTTPException(status_code=400, detail="Invalid or expired pagination cursor.")

    @staticmethod
    def _sort_statement(stmt, sort: str):
        if sort == "price_asc":
            return stmt.order_by(Product.price.asc(), Product.uid.asc())
        if sort == "price_desc":
            return stmt.order_by(Product.price.desc(), Product.uid.desc())
        if sort == "rating":
            return stmt.order_by(Product.rating_avg.desc(), Product.created_at.desc(), Product.uid.desc())
        return stmt.order_by(Product.created_at.desc(), Product.uid.desc())

    @staticmethod
    def _after_cursor(sort: str, position: list[object]):
        """Rows strictly after a keyset cursor in the active order."""
        if sort == "newest":
            created_at, uid = position
            return or_(Product.created_at < created_at, and_(Product.created_at == created_at, Product.uid < uid))
        if sort == "price_asc":
            price, uid = position
            return or_(Product.price > price, and_(Product.price == price, Product.uid > uid))
        if sort == "price_desc":
            price, uid = position
            return or_(Product.price < price, and_(Product.price == price, Product.uid < uid))
        rating, created_at, uid = position
        return or_(
            Product.rating_avg < rating,
            and_(Product.rating_avg == rating, Product.created_at < created_at),
            and_(Product.rating_avg == rating, Product.created_at == created_at, Product.uid < uid),
        )

    @staticmethod
    def _page_metadata(total: int | None, page_size: int) -> tuple[int | None, int | None]:
        return total, math.ceil(total / page_size) if total else (0 if total == 0 else None)
    @staticmethod
    def _with_available_images(product: Product) -> Product:
        """Hide stale local-media references without deleting recoverable records."""
        available_images = [
            image for image in product.images
            if is_local_product_image_available(image.url)
        ]
        if len(available_images) == len(product.images):
            return product
        response_product = copy(product)
        response_product.images = available_images
        return response_product

    async def _attach_images(
        self,
        product: Product,
        urls: List[str],
        vendor_id: uuid.UUID,
        session: AsyncSession,
    ) -> None:
        """Replace product images with new list."""
        if len(urls) > MAX_PRODUCT_IMAGES:
            raise HTTPException(
                status_code=400,
                detail=f"You can attach at most {MAX_PRODUCT_IMAGES} images.",
            )
        normalized_urls: list[str] = []
        for raw_url in urls:
            if not isinstance(raw_url, str) or not raw_url.strip():
                continue
            url = raw_url.strip()
            filename = get_image_filename(url)
            if filename:
                parsed = urlsplit(url)
                token = parse_qs(parsed.query).get("token", [None])[0]
                if not verify_image_access_token(token, filename, vendor_id):
                    raise HTTPException(
                        status_code=403,
                        detail="One or more product images are not authorized for this vendor.",
                    )
                if not is_local_product_image_available(url):
                    raise HTTPException(
                        status_code=400,
                        detail="One or more uploaded product images are no longer available.",
                    )
                normalized_urls.append(canonical_image_url(filename))
                continue
            parsed = urlsplit(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise HTTPException(status_code=400, detail="Product images must use a valid image URL.")
            normalized_urls.append(url)
        # delete existing
        existing = await session.exec(select(ProductImage).where(ProductImage.product_id == product.uid))
        for img in existing.all():
            await session.delete(img)
        # add new
        for pos, url in enumerate(normalized_urls):
            width = None
            height = None
            fn = get_image_filename(url)
            if fn:
                path = PRODUCT_IMAGE_DIR / fn
                if path.is_file():
                    try:
                        from PIL import Image
                        with Image.open(path) as im:
                            width, height = im.size
                    except Exception:
                        pass
            session.add(
                ProductImage(
                    product_id=product.uid,
                    url=url,
                    position=pos,
                    width=width,
                    height=height,
                )
            )

    async def get_all(
        self,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        category_slug: Optional[str] = None,
        vendor_slug: Optional[str] = None,
        query: Optional[str] = None,
        ids: Optional[str] = None,
        min_price: Optional[Decimal] = None,
        max_price: Optional[Decimal] = None,
        in_stock: Optional[bool] = None,
        sort: str = "newest",
        cursor: Optional[str] = None,
        include_total: Optional[bool] = None,
    ) -> ProductListOut:
        stmt = select(Product).join(Vendor, Product.vendor_id == Vendor.uid).where(
            Product.status == "active", Vendor.status == "approved"
        )
        if ids:
            parsed_ids = []
            for raw_id in ids.split(","):
                try:
                    parsed_ids.append(uuid.UUID(raw_id.strip()))
                except (ValueError, AttributeError):
                    continue
            if parsed_ids:
                stmt = stmt.where(Product.uid.in_(parsed_ids))
        if category_slug:
            cat_q = await session.exec(select(Category).where(Category.slug == category_slug))
            cat = cat_q.first()
            if cat:
                stmt = stmt.where(Product.category_id == cat.uid)
        if vendor_slug:
            v_q = await session.exec(select(Vendor).where(Vendor.slug == vendor_slug, Vendor.status == "approved"))
            vendor = v_q.first()
            if vendor:
                stmt = stmt.where(Product.vendor_id == vendor.uid)
            else:
                return ProductListOut(
                    items=[], total=0 if include_total is not False else None,
                    page=page, page_size=page_size,
                    pages=0 if include_total is not False else None,
                )
        clean_query = query.strip() if (query and query.strip()) else None
        if clean_query:
            stmt = stmt.where(Product.title.ilike(f"%{self._escape_like(clean_query)}%", escape="!"))
        if min_price is not None:
            stmt = stmt.where(Product.price >= min_price)
        if max_price is not None:
            stmt = stmt.where(Product.price <= max_price)
        if in_stock is True:
            stmt = stmt.where(Product.stock > 0)

        # New clients explicitly set include_total=false. We fetch one extra
        # row to determine whether there is another page, avoiding COUNT and
        # OFFSET entirely. Omitting it preserves the legacy numbered API.
        cursor_mode = cursor is not None or include_total is False
        fingerprint = self._cursor_fingerprint(
            category=category_slug, vendor=vendor_slug, query=clean_query,
            ids=ids, min_price=min_price, max_price=max_price,
            in_stock=in_stock, sort=sort,
        )
        if cursor:
            position = self._decode_cursor(cursor, sort=sort, fingerprint=fingerprint)
            stmt = stmt.where(self._after_cursor(sort, position))
        stmt = self._sort_statement(stmt, sort)

        total: int | None = None
        if cursor_mode:
            stmt = stmt.limit(page_size + 1)
        else:
            total = (await session.exec(select(func.count()).select_from(stmt.order_by(None).subquery()))).one()
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await session.exec(stmt)).all()
        has_more = cursor_mode and len(rows) > page_size
        rows = rows[:page_size]
        total, pages = self._page_metadata(total, page_size)
        return ProductListOut(
            items=[self._with_available_images(product) for product in rows],
            total=total, page=page, page_size=page_size, pages=pages,
            has_more=has_more,
            next_cursor=(self._encode_cursor(sort=sort, fingerprint=fingerprint, product=rows[-1]) if has_more else None),
        )

    async def get_by_slug(self, slug: str, session: AsyncSession) -> Optional[Product]:
        result = await session.exec(
            select(Product)
            .join(Vendor, Product.vendor_id == Vendor.uid)
            .where(Product.slug == slug, Product.status == "active", Vendor.status == "approved")
        )
        product = result.first()
        return self._with_available_images(product) if product else None

    async def get_by_id(self, uid: uuid.UUID, session: AsyncSession) -> Optional[Product]:
        result = await session.exec(select(Product).where(Product.uid == uid))
        return result.first()

    async def get_vendor_products(
        self,
        vendor_id: uuid.UUID,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        query: Optional[str] = None,
        cursor: Optional[str] = None,
        include_total: Optional[bool] = None,
    ) -> VendorProductListOut:
        stmt = select(Product).where(Product.vendor_id == vendor_id)
        clean_query = query.strip() if (query and query.strip()) else None
        if clean_query:
            pattern = f"%{self._escape_like(clean_query)}%"
            # ILIKE matches the pg_trgm indexes directly. The old lower(...)
            # expressions could not use the regular trigram operator class.
            stmt = stmt.where(
                Product.title.ilike(pattern, escape="!")
                | Product.slug.ilike(pattern, escape="!")
                | Product.sku.ilike(pattern, escape="!")
            )
        cursor_mode = cursor is not None or include_total is False
        fingerprint = self._cursor_fingerprint(vendor_id=vendor_id, query=clean_query, sort="newest")
        if cursor:
            position = self._decode_cursor(cursor, sort="newest", fingerprint=fingerprint)
            stmt = stmt.where(self._after_cursor("newest", position))
        stmt = self._sort_statement(stmt, "newest")
        total: int | None = None
        if cursor_mode:
            stmt = stmt.limit(page_size + 1)
        else:
            total = (await session.exec(select(func.count()).select_from(stmt.order_by(None).subquery()))).one()
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await session.exec(stmt)).all()
        has_more = cursor_mode and len(rows) > page_size
        rows = rows[:page_size]
        total, pages = self._page_metadata(total, page_size)
        return VendorProductListOut(
            items=[self._with_available_images(product) for product in rows],
            total=total, page=page, page_size=page_size, pages=pages,
            has_more=has_more,
            next_cursor=(self._encode_cursor(sort="newest", fingerprint=fingerprint, product=rows[-1]) if has_more else None),
        )

    async def get_vendor_summary(
        self,
        vendor_id: uuid.UUID,
        session: AsyncSession,
    ) -> VendorProductSummaryOut:
        from sqlalchemy import and_, case, func
        result = await session.exec(
            select(
                func.count().label("total"),
                func.count(case((Product.status == "active", 1))).label("active"),
                func.count(case((and_(Product.status == "active", Product.stock < 5), 1))).label("low_stock"),
                func.coalesce(
                    func.sum(case((Product.status == "active", Product.price * Product.stock), else_=None)),
                    0
                ).label("inventory_value"),
            ).where(Product.vendor_id == vendor_id)
        )
        row = result.one()
        return VendorProductSummaryOut(
            total=row.total or 0,
            active=row.active or 0,
            low_stock=row.low_stock or 0,
            inventory_value=round(float(row.inventory_value or 0), 2),
        )

    async def create(self, vendor_id: uuid.UUID, data: ProductCreate, session: AsyncSession) -> Product:
        if data.category_id is not None:
            category_result = await session.exec(
                select(Category).where(Category.uid == data.category_id)
            )
            if category_result.first() is None:
                raise HTTPException(status_code=422, detail="Selected category does not exist.")

        payload = data.model_dump(exclude={"image_urls"})
        payload["vendor_id"] = vendor_id
        payload["status"] = "active"
        product = Product(**payload)
        session.add(product)
        try:
            await session.flush()  # get uid before images
            await self._attach_images(product, data.image_urls, vendor_id, session)
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            constraint = str(getattr(exc.orig, "diag", None) or exc.orig).lower()
            if "sku" in constraint:
                detail = "A product with this SKU already exists."
            elif "slug" in constraint:
                detail = "A product with this URL slug already exists."
            else:
                detail = "Product could not be saved because it conflicts with existing data."
            raise HTTPException(status_code=409, detail=detail) from exc
        except HTTPException:
            await session.rollback()
            raise
        await session.refresh(product)
        return self._with_available_images(product)

    async def update(self, product: Product, data: ProductUpdate, session: AsyncSession) -> Product:
        next_price = data.price if data.price is not None else product.price
        next_mrp = data.mrp if 'mrp' in data.model_fields_set else product.mrp
        if next_mrp is not None and next_mrp < next_price:
            raise HTTPException(
                status_code=422,
                detail='MRP must be greater than or equal to the selling price',
            )
        if data.mrp is None and 'mrp' in data.model_fields_set:
            product.mrp = None
        payload = data.model_dump(exclude_none=True, exclude={"image_urls"})
        for k, v in payload.items():
            setattr(product, k, v)
        if data.stock is not None:
            product.stock = data.stock
        if data.image_urls is not None:
            try:
                await self._attach_images(product, data.image_urls, product.vendor_id, session)
            except HTTPException:
                await session.rollback()
                raise
        await session.commit()
        await session.refresh(product)
        return self._with_available_images(product)

    async def delete(self, product: Product, session: AsyncSession) -> None:
        product.status = "archived"
        await session.commit()
