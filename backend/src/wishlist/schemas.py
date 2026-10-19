import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.products.schemas import ProductSummaryOut


class WishlistItemAdd(BaseModel):
    product_id: uuid.UUID


class WishlistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    product_id: uuid.UUID
    product_title: str
    product_slug: str
    created_at: datetime | None = None
    product: ProductSummaryOut


class WishlistOut(BaseModel):
    items: list[WishlistItemOut]
    total: int
