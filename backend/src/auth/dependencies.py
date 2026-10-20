from fastapi import Depends, Request
from fastapi.security import HTTPBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.main import get_session
from src.db.models import User
from src.config import Config
from src.errors import (
    AccessTokenRequired,
    AccountNotVerified,
    InsufficientPermission,
    InvalidToken,
    RefreshTokenRequired,
    RevokedToken,
)

from .service import TokenBlocklistService, UserService
from .utils import decode_token

user_service = UserService()
token_blocklist_service = TokenBlocklistService()

class TokenBearer(HTTPBearer):
    def __init__(self, auto_error=True, cookie_name: str | None = None, cookie_only: bool = False):
        super().__init__(auto_error=auto_error)
        self.cookie_name = cookie_name
        self.cookie_only = cookie_only

    async def __call__(
        self,
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        token = request.cookies.get(self.cookie_name) if self.cookie_name else None
        if not token and self.cookie_only:
            raise InvalidToken()
        if not token:
            creds = await super().__call__(request)
            token = creds.credentials

        token_data = decode_token(token)

        if not self.token_valid(token_data):
            raise InvalidToken()
            
        token_revoked = await token_blocklist_service.is_token_revoked(
            token_data["jti"], session
        )

        if token_revoked:
            raise RevokedToken()
            
            
        self.verify_token_data(token_data)

        return token_data

    def token_valid(self, token_data: dict | None) -> bool:
        required_claims = {"user", "jti", "refresh", "exp", "sv"}
        return (
            isinstance(token_data, dict)
            and required_claims.issubset(token_data)
            and isinstance(token_data["sv"], int)
            and not isinstance(token_data["sv"], bool)
        )
    
    def verify_token_data(self , token_data):
        raise NotImplementedError("Please override this method in child classes")
    
    
        


class AccessTokenBearer(TokenBearer):
    def verify_token_data(self, token_data: dict) -> None:
        if token_data and token_data["refresh"]:
            raise AccessTokenRequired()


class RefreshTokenBearer(TokenBearer):
    def __init__(self, auto_error=True):
        super().__init__(auto_error=auto_error, cookie_name=Config.REFRESH_COOKIE_NAME, cookie_only=True)

    def verify_token_data(self, token_data: dict) -> None:
            if token_data and not token_data["refresh"]:
                raise RefreshTokenRequired()
                
                
async def get_current_user(
    token_details : dict = Depends(AccessTokenBearer()),
    session : AsyncSession = Depends(get_session)
    
):
    
    token_user = token_details.get("user")
    if not isinstance(token_user, dict):
        raise InvalidToken()

    user_uid = token_user.get("user_uid")
    user_email = token_user.get("email")
    if not isinstance(user_uid, str) or not isinstance(user_email, str):
        raise InvalidToken()

    user = await user_service.get_user_by_uid(user_uid, session)

    # A token can remain structurally valid after its user has been deleted.
    # Treat that token as invalid instead of allowing a later attribute error.
    if user is None:
        raise InvalidToken()

    # Do not trust identity or authorization state embedded in a JWT.  The
    # UID/email binding also prevents a token being accepted after an account
    # identity change, and the session version invalidates every old session.
    if user.email != user_email or user.session_version != token_details["sv"]:
        raise InvalidToken()
    
    return user


async def get_verified_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Return the authenticated user only when their email is verified."""

    if not current_user.is_verified:
        raise AccountNotVerified()

    return current_user


class RoleChecker:
    def __init__(self, allowed_roles: list[str]) -> None:
        
        self.allowed_roles = allowed_roles
        
        
        
    def __call__(self, current_user: User = Depends(get_verified_user)) -> User:
        if current_user.role in self.allowed_roles:
            return current_user
        
        raise InsufficientPermission()
