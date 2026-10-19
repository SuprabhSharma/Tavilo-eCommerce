from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ReviewModel(BaseModel):
    uid: uuid.UUID
    rating: int = Field(ge=1, le=5)
    review_text: str
    user_id: uuid.UUID
    book_id: uuid.UUID | None = None
    created_at: datetime | None = None


class ReviewCreateModel(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    rating: int
    review_text: str
    user_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    book_id: uuid.UUID | None = None
    created_at: datetime | None = None