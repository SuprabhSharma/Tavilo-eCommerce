import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")
INDIAN_PINCODE_RE = re.compile(r"^\d{6}$")


def _strip_text(value: object) -> object:
    if not isinstance(value, str):
        return value
    return value.strip()


class _AddressFields(BaseModel):
    @field_validator("name", "line1", "city", "state", mode="before", check_fields=False)
    @classmethod
    def required_text_must_not_be_blank(cls, value: object) -> object:
        value = _strip_text(value)
        if isinstance(value, str) and not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("line2", mode="before", check_fields=False)
    @classmethod
    def normalize_optional_line2(cls, value: object) -> object:
        value = _strip_text(value)
        return value or None

    @field_validator("phone", mode="before", check_fields=False)
    @classmethod
    def validate_indian_mobile(cls, value: object) -> object:
        value = _strip_text(value)
        if isinstance(value, str) and not INDIAN_MOBILE_RE.fullmatch(value):
            raise ValueError("Phone must be a valid 10-digit Indian mobile number")
        return value

    @field_validator("pincode", mode="before", check_fields=False)
    @classmethod
    def validate_indian_pincode(cls, value: object) -> object:
        value = _strip_text(value)
        if isinstance(value, str) and not INDIAN_PINCODE_RE.fullmatch(value):
            raise ValueError("Pincode must be a valid 6-digit Indian postal code")
        return value


class AddressCreate(_AddressFields):
    name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=10, max_length=10)
    line1: str = Field(..., min_length=1, max_length=200)
    line2: Optional[str] = Field(default=None, max_length=200)
    city: str = Field(..., min_length=1, max_length=80)
    state: str = Field(..., min_length=1, max_length=80)
    pincode: str = Field(..., min_length=6, max_length=6)
    is_default: bool = False


class AddressUpdate(_AddressFields):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=10)
    line1: Optional[str] = Field(default=None, min_length=1, max_length=200)
    line2: Optional[str] = Field(default=None, max_length=200)
    city: Optional[str] = Field(default=None, min_length=1, max_length=80)
    state: Optional[str] = Field(default=None, min_length=1, max_length=80)
    pincode: Optional[str] = Field(default=None, min_length=6, max_length=6)
    is_default: Optional[bool] = None


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    name: str
    phone: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    is_default: bool
    created_at: Optional[datetime] = None