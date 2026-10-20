
from typing import Any, Callable  # noqa: UP035

from fastapi import FastAPI, status  # type: ignore[import-not-found]
from fastapi.requests import Request  # type: ignore[import-not-found]
from fastapi.responses import JSONResponse  # type: ignore[import-not-found]
from sqlalchemy.exc import SQLAlchemyError


class MarketplaceException(Exception):
    """Base class for Tavilo marketplace errors."""



class InvalidToken(MarketplaceException):
    """User has provided an invalid or expired token"""


class InvalidVerificationToken(MarketplaceException):
    """The email verification link is invalid, expired, or already used."""




class RevokedToken(MarketplaceException):
    """User has provided a token that has been revoked"""




class AccessTokenRequired(MarketplaceException):
    """User has provided a refresh token when an access token is needed"""




class RefreshTokenRequired(MarketplaceException):
    """User has provided an access token when a refresh token is needed"""




class UserAlreadyExists(MarketplaceException):
    """User has provided an email for a user who exists during sign up."""




class InvalidCredentials(MarketplaceException):
    """User has provided wrong email or password during log in."""




class InsufficientPermission(MarketplaceException):
    """User does not have the neccessary permissions to perform an action."""




class ReviewNotFound(MarketplaceException):
    """Review Not found"""




class ProductNotFound(MarketplaceException):
    """Product Not found"""




class VendorNotFound(MarketplaceException):
    """Vendor Not found"""


class VendorAlreadyExists(MarketplaceException):
    """User has already registered or applied for a vendor store"""


class VendorSlugAlreadyExists(MarketplaceException):
    """Vendor store slug / handle is already taken"""


class ServiceNotFound(MarketplaceException):
    """Service offering not found"""


class OrderNotFound(MarketplaceException):
    """Order Not found"""



class UserNotFound(MarketplaceException):
    """User Not found"""




class AccountNotVerified(Exception):
    """Account not yet verified"""


class EmailDeliveryUnavailable(MarketplaceException):
    """The configured email provider could not accept a message right now."""





def create_exception_handler(
    status_code: int, initial_detail: Any
) -> Callable[[Request, Exception], JSONResponse]:

    async def exception_handler(request: Request, exc: MarketplaceException):

        return JSONResponse(content=initial_detail, status_code=status_code)

    return exception_handler


def register_all_errors(app: FastAPI):
    app.add_exception_handler(
        UserAlreadyExists,
        create_exception_handler(
            status_code=status.HTTP_403_FORBIDDEN,
            initial_detail={
                "message": "User with email already exists",
                "error_code": "user_exists",
            },
        ),
    )

    app.add_exception_handler(
        UserNotFound,
        create_exception_handler(
            status_code=status.HTTP_404_NOT_FOUND,
            initial_detail={
                "message": "User not found",
                "error_code": "user_not_found",
            },
        ),
    )
    app.add_exception_handler(
        InvalidCredentials,
        create_exception_handler(
            status_code=status.HTTP_400_BAD_REQUEST,
            initial_detail={
                "message": "Invalid Email Or Password",
                "error_code": "invalid_email_or_password",
            },
        ),
    )
    app.add_exception_handler(
        InvalidToken,
        create_exception_handler(
            status_code=status.HTTP_401_UNAUTHORIZED,
            initial_detail={
                "message": "Token is invalid Or expired",
                "resolution": "Please get new token",
                "error_code": "invalid_token",
            },
        ),
    )
    app.add_exception_handler(
        InvalidVerificationToken,
        create_exception_handler(
            status_code=status.HTTP_400_BAD_REQUEST,
            initial_detail={
                "message": "This email verification link is invalid or expired. Request a new link.",
                "error_code": "invalid_verification_token",
            },
        ),
    )
    app.add_exception_handler(
        RevokedToken,
        create_exception_handler(
            status_code=status.HTTP_401_UNAUTHORIZED,
            initial_detail={
                "message": "Token is invalid or has been revoked",
                "resolution": "Please get new token",
                "error_code": "token_revoked",
            },
        ),
    )
    app.add_exception_handler(
        AccessTokenRequired,
        create_exception_handler(
            status_code=status.HTTP_401_UNAUTHORIZED,
            initial_detail={
                "message": "Please provide a valid access token",
                "resolution": "Please get an access token",
                "error_code": "access_token_required",
            },
        ),
    )
    app.add_exception_handler(
        RefreshTokenRequired,
        create_exception_handler(
            status_code=status.HTTP_403_FORBIDDEN,
            initial_detail={
                "message": "Please provide a valid refresh token",
                "resolution": "Please get an refresh token",
                "error_code": "refresh_token_required",
            },
        ),
    )
    app.add_exception_handler(
        InsufficientPermission,
        create_exception_handler(
            status_code=status.HTTP_401_UNAUTHORIZED,
            initial_detail={
                "message": "You do not have enough permissions to perform this action",
                "error_code": "insufficient_permissions",
            },
        ),
    )
    app.add_exception_handler(
        ReviewNotFound,
        create_exception_handler(
            status_code=status.HTTP_404_NOT_FOUND,
            initial_detail={
                "message": "Review not found",
                "error_code": "review_not_found",
            },
        ),
    )

    app.add_exception_handler(
        ProductNotFound,
        create_exception_handler(
            status_code=status.HTTP_404_NOT_FOUND,
            initial_detail={
                "message": "Product not found",
                "error_code": "product_not_found",
            },
        ),
    )

    app.add_exception_handler(
        VendorNotFound,
        create_exception_handler(
            status_code=status.HTTP_404_NOT_FOUND,
            initial_detail={
                "message": "Vendor not found",
                "error_code": "vendor_not_found",
            },
        ),
    )

    app.add_exception_handler(
        VendorAlreadyExists,
        create_exception_handler(
            status_code=status.HTTP_409_CONFLICT,
            initial_detail={
                "message": "You have already registered or applied for a vendor store",
                "error_code": "vendor_already_exists",
            },
        ),
    )

    app.add_exception_handler(
        VendorSlugAlreadyExists,
        create_exception_handler(
            status_code=status.HTTP_409_CONFLICT,
            initial_detail={
                "message": "Store handle/slug is already taken. Please choose another.",
                "error_code": "store_handle_taken",
            },
        ),
    )

    app.add_exception_handler(
        ServiceNotFound,
        create_exception_handler(
            status_code=status.HTTP_404_NOT_FOUND,
            initial_detail={
                "message": "Service not found",
                "error_code": "service_not_found",
            },
        ),
    )

    app.add_exception_handler(
        OrderNotFound,
        create_exception_handler(
            status_code=status.HTTP_404_NOT_FOUND,
            initial_detail={
                "message": "Order not found",
                "error_code": "order_not_found",
            },
        ),
    )

    app.add_exception_handler(
        AccountNotVerified,
        create_exception_handler(
            status_code=status.HTTP_403_FORBIDDEN,
            initial_detail={
                "message": "Account not verified",
                "error_code": "account_not_verified",
                "resolution": "Please check your email for verification details",
            },
        ),
    )

    app.add_exception_handler(
        EmailDeliveryUnavailable,
        create_exception_handler(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            initial_detail={
                "message": "Email delivery is temporarily unavailable. Please try again shortly.",
                "error_code": "email_delivery_unavailable",
            },
        ),
    )

    @app.exception_handler(500)
    async def internal_server_error(request, exc):

        return JSONResponse(
            content={
                "message": "Oops! Something went wrong",
                "error_code": "server_error",
            },
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


    @app.exception_handler(SQLAlchemyError)
    async def database__error(request, exc):
        print(str(exc))
        return JSONResponse(
            content={
                "message": "Oops! Something went wrong",
                "error_code": "server_error",
            },
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

