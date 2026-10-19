import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    name: str
    slug: str
    parent_id: uuid.UUID | None = None
    image_url: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    parent_id: uuid.UUID | None = None
    image_url: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    name: str
    slug: str
    parent_id: uuid.UUID | None = None
    image_url: str | None = None
    created_at: datetime | None = None
