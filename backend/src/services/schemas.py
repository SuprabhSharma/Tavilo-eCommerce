import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ServiceCreate(BaseModel):
    title: str
    slug: str
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    duration_minutes: int = Field(default=60, ge=1)
    image_urls: list[str] = []


class ServiceUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=1)
    status: str | None = None
    image_urls: list[str] | None = None


class ServiceImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    url: str
    position: int


class ServiceVendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    store_name: str
    slug: str


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    title: str
    slug: str
    description: str | None = None
    price: Decimal
    duration_minutes: int
    status: str
    vendor: ServiceVendorOut | None = None
    images: list[ServiceImageOut] = []
    created_at: datetime | None = None


class ServiceListOut(BaseModel):
    items: list[ServiceOut]
    total: int
    page: int
    page_size: int
    pages: int
