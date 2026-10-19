import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AddressCreate(BaseModel):
    name: str
    phone: str
    line1: str
    line2: str | None = None
    city: str
    state: str
    pincode: str
    is_default: bool = False


class AddressUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    line1: str | None = None
    line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    is_default: bool | None = None


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    name: str
    phone: str
    line1: str
    line2: str | None = None
    city: str
    state: str
    pincode: str
    is_default: bool
    created_at: datetime | None = None
