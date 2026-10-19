import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from src.reviews.schemas import ReviewModel


class Book(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: uuid.UUID
    title: str
    author: str
    publisher: str
    published_date: date
    page_count: int
    language: str
    user_id: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

class BookDetailModel(Book):
    reviews : list[ReviewModel]

class BookCreateModel(BaseModel):
    title: str
    author: str
    publisher: str
    published_date: date
    page_count: int
    language: str


class BookUpdateModel(BaseModel):
    title: str | None = None
    author: str | None = None
    page_count: int | None = None