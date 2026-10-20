from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReviewCreateModel(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str = Field(min_length=1, max_length=2000)

    @field_validator("review_text")
    @classmethod
    def validate_review_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Review text cannot be empty")
        return value


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    rating: int
    review_text: str
    user_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    verified_purchase: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReviewStatusOut(BaseModel):
    can_review: bool
    review: ReviewOut | None = None
