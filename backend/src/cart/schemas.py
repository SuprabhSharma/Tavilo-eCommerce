import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from src.products.schemas import ProductSummaryOut


class CartItemAdd(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(1, ge=1)


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=1)


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    product_title: str
    product: ProductSummaryOut


class CartOut(BaseModel):
    uid: uuid.UUID
    items: list[CartItemOut]
    subtotal: Decimal
