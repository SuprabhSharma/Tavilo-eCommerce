import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


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
    # Sent in the request body after the browser reads it from a URL fragment;
    # it is never part of an API URL or a proxy/access-log path.
    token: str = Field(min_length=43, max_length=128)
    new_password: str
    confirm_new_password: str
