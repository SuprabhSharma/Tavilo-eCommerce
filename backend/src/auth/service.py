from datetime import datetime, timezone

from sqlalchemy import delete
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import RevokedToken, User

from .schemas import UserCreateModel
from .utils import generate_passwd_hash


class UserService:
    async def get_user_by_email(self , email : str, session : AsyncSession):
        statement = select(User).where(User.email == email)
        
        result = await session.exec(statement)
        
        user = result.first()
        
        return user
    
    
    async def user_exists(self, email , session : AsyncSession):
        user = await self.get_user_by_email(email , session)
        
        
        
        return user is not None

    async def username_exists(self, username: str, session: AsyncSession) -> bool:
        result = await session.exec(select(User).where(User.username == username))
        return result.first() is not None
    
    
    async def create_user(self, user_data: UserCreateModel, session: AsyncSession):
        user_data_dict = user_data.model_dump(exclude={"password"})

        new_user = User(**user_data_dict)

        new_user.password_hash = generate_passwd_hash(user_data.password)

        new_user.role = "customer"
        session.add(new_user)

        await session.commit()
        await session.refresh(new_user)

        return new_user

    async def update_user(
        self, user: User, update_data: dict[str, object], session: AsyncSession
    ) -> User:
        for field, value in update_data.items():
            setattr(user, field, value)

        await session.commit()
        await session.refresh(user)

        return user


class TokenBlocklistService:
    """Persist revoked JWT IDs in PostgreSQL instead of an external cache."""

    async def is_token_revoked(self, jti: str, session: AsyncSession) -> bool:
        statement = select(RevokedToken).where(
            RevokedToken.jti == jti,
            RevokedToken.expires_at > datetime.now(timezone.utc),
        )
        result = await session.exec(statement)
        return result.first() is not None

    async def revoke_token(
        self, jti: str, expires_at: datetime, session: AsyncSession
    ) -> None:
        await session.exec(
            delete(RevokedToken).where(
                RevokedToken.expires_at <= datetime.now(timezone.utc)
            )
        )
        session.add(RevokedToken(jti=jti, expires_at=expires_at))
        await session.commit()
    
    
    
