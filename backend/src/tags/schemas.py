import uuid
from datetime import datetime

from pydantic import BaseModel


class TagModel(BaseModel):
    uid: uuid.UUID
    name: str
    created_at: datetime | None = None


class TagCreateModel(BaseModel):
    name: str


class TagAddModel(BaseModel):
    tags: list[TagCreateModel]