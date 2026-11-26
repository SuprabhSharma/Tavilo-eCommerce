import uuid
from datetime import datetime
from decimal import Decimal

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DirectCheckoutItem(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(1, ge=1, le=2_147_483_647)


class CheckoutRequest(BaseModel):
    address_id: uuid.UUID
    payment_method: Literal["cod", "online_mock"] = "cod"
    direct_item: DirectCheckoutItem | None = None


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    product_id: uuid.UUID
    title_snapshot: str
    price_snapshot: Decimal
    quantity: int
    line_total: Decimal | None = None
    image_url: str | None = None
    product_slug: str | None = None

    @model_validator(mode="after")
    def compute_line_total(self):
        if self.line_total is None and self.price_snapshot is not None and self.quantity is not None:
            self.line_total = Decimal(str(self.price_snapshot)) * self.quantity
        return self


class SubOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    order_id: uuid.UUID | None = None
    vendor_id: uuid.UUID
    store_name: str | None = None
    subtotal: Decimal
    status: str
    # Timestamps let the UI render "Shipped on Nov 5" / "Delivered on Nov 6" per shipment
    created_at: datetime | None = None
    updated_at: datetime | None = None
    items: list[OrderItemOut]
    parent_order_status: str | None = None


class VendorOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    product_id: uuid.UUID
    title_snapshot: str
    price_snapshot: Decimal
    quantity: int
    line_total: Decimal | None = None
    image_url: str | None = None
    product_slug: str | None = None

    @model_validator(mode="after")
    def compute_line_total(self):
        if self.line_total is None and self.price_snapshot is not None and self.quantity is not None:
            self.line_total = Decimal(str(self.price_snapshot)) * self.quantity
        return self


class VendorSubOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    order_id: uuid.UUID
    vendor_id: uuid.UUID
    subtotal: Decimal
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    items: list[VendorOrderItemOut]
    address_snapshot: dict | None = None
    payment_method: str | None = None
    payment_status: str | None = None
    parent_order_status: str | None = None


class VendorOrderPageOut(BaseModel):
    items: list[VendorSubOrderOut]
    total: int
    page: int
    page_size: int
    pages: int
    status_counts: dict[str, int]


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    total: Decimal
    payment_method: str
    payment_status: str
    status: str
    address_snapshot: dict
    sub_orders: list[SubOrderOut]
    created_at: datetime | None = None


class SubOrderStatusUpdate(BaseModel):
    status: str  # placed | confirmed | shipped | delivered | cancelled
