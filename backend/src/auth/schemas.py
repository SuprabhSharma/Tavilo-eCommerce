import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field
from src.books.schemas import Book
from src.reviews.schemas import ReviewModel


class UserCreateModel(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: EmailStr
    first_name: str
    last_name: str
    password: str = Field(min_length=6, max_length=72)


class UserModel(BaseModel):
    uid: uuid.UUID
    username: str
    email: str
    first_name: str
    last_name: str
    role: str
    is_verified: bool = Field(default=False)
    password_hash: str = Field(exclude=True)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    
    
class UserBooksModel(UserModel):
    books : list[Book]
    reviews : list[ReviewModel]
    
    



class UserLoginModel(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    
    
    
class EmailModel(BaseModel):
    addresses: list[EmailStr] = Field(min_length=1)
    
    
    
class PasswordResetRequestModel(BaseModel):
    email: EmailStr


class EmailVerificationTokenModel(BaseModel):
    """The opaque, one-time token supplied by the verification page."""

    token: str = Field(min_length=43, max_length=128)


class PasswordResetConfirmModel(BaseModel):
    new_password: str
    confirm_new_password: str
