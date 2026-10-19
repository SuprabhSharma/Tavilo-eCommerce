import uuid
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator


def calculate_discount_percent(price: Decimal, mrp: Decimal | None) -> Decimal:
    if mrp is None or mrp <= price or mrp <= 0:
        return Decimal('0.00')
    return ((mrp - price) / mrp * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def validate_price_pair(price: Decimal, mrp: Decimal | None) -> None:
    if mrp is not None and mrp < price:
        raise ValueError('MRP must be greater than or equal to the selling price')


class ProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    url: str
    position: int


class ProductSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    title: str
    slug: str
    price: Decimal
    mrp: Decimal | None = None
    stock: int
    images: list[ProductImageOut] = []

    @computed_field
    @property
    def discount_percent(self) -> Decimal:
        return calculate_discount_percent(self.price, self.mrp)


class ProductBase(BaseModel):
    title: str
    description: str | None = None
    price: Decimal = Field(..., gt=0)
    mrp: Decimal | None = Field(default=None, ge=0)
    stock: int = Field(default=0, ge=0)
    sku: str | None = None
    category_id: uuid.UUID | None = None
    attributes: dict | None = None

    @model_validator(mode='after')
    def validate_prices(self):
        validate_price_pair(self.price, self.mrp)
        return self


class ProductCreate(ProductBase):
    slug: str
    image_urls: list[str] = []


class ProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    price: Decimal | None = Field(default=None, gt=0)
    mrp: Decimal | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    sku: str | None = None
    category_id: uuid.UUID | None = None
    status: str | None = None
    attributes: dict | None = None
    image_urls: list[str] | None = None

    @model_validator(mode='after')
    def validate_prices(self):
        if self.price is not None and self.mrp is not None:
            validate_price_pair(self.price, self.mrp)
        return self


class VendorMiniOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    store_name: str
    slug: str


class CategoryMiniOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    name: str
    slug: str


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    title: str
    slug: str
    description: str | None = None
    price: Decimal
    mrp: Decimal | None = None
    stock: int
    sku: str | None = None
    status: str
    rating_avg: Decimal
    rating_count: int
    attributes: dict | None = None
    vendor: VendorMiniOut | None = None
    category: CategoryMiniOut | None = None
    images: list[ProductImageOut] = []
    created_at: datetime | None = None

    @computed_field
    @property
    def discount_percent(self) -> Decimal:
        return calculate_discount_percent(self.price, self.mrp)


class ProductListOut(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int
