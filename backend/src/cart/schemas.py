import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from src.products.schemas import ProductSummaryOut


class CartItemAdd(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(1, ge=1)


class CartItemUpsert(BaseModel):
    """Used by Buy Now — sets quantity absolutely, never accumulates."""
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

    @computed_field
    @property
    def max_qty(self) -> int:
        """
        The maximum quantity this item can be set to in the cart.
        = min(real_stock, vendor_max_order_qty_if_set).
        The frontend uses this to disable + and show the limit message.
        """
        return self.product.available_stock

    @computed_field
    @property
    def at_limit(self) -> bool:
        """True when the cart quantity equals the maximum allowed."""
        return self.quantity >= self.max_qty


class CartOut(BaseModel):
    uid: uuid.UUID
    items: list[CartItemOut]
    subtotal: Decimal
