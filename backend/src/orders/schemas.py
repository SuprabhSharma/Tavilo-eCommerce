import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator


class CheckoutRequest(BaseModel):
    address_id: uuid.UUID
    payment_method: str = "cod"  # cod | online_mock


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
    status: str  # confirmed | shipped | delivered | cancelled
