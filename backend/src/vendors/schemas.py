import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class VendorApply(BaseModel):
    store_name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None


class VendorUpdate(BaseModel):
    store_name: str | None = None
    description: str | None = None
    logo_url: str | None = None


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    store_name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    status: str
    created_at: datetime | None = None
