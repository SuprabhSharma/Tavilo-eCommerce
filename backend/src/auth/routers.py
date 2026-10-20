from datetime import timedelta, timezone, datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.config import Config
from src.audit import record_audit
from src.db.main import get_session
from src.db.models import PasswordResetToken, PendingRegistration, User
from src.errors import (
    AccountNotVerified,
    EmailDeliveryUnavailable,
    InvalidCredentials,
    InvalidToken,
    InvalidVerificationToken,
    UserAlreadyExists,
    UserNotFound,
)
from src.mail import (
    EmailDeliveryError,
    create_message,
    deliver_message,
    deliver_message_in_background,
)

from .dependencies import (
    AccessTokenBearer,
    RefreshTokenBearer,
    RoleChecker,
    get_verified_user,
)
from .schemas import (
    EmailModel,
    EmailVerificationTokenModel,
    PasswordResetConfirmModel,
    PasswordResetRequestModel,
    UserCreateModel,
    UserLoginModel,
    UserModel,
)
from .service import TokenBlocklistService, UserService
from .utils import (
    create_access_tokens,
    create_email_verification_token,
    create_password_reset_token,
    decode_url_safe_token,
    generate_passwd_hash,
    hash_password_reset_token,
    hash_email_verification_token,
    normalize_email,
    verify_password,
    decode_token,
)

REFRESH_TOKEN_EXPIRY = 2
EMAIL_VERIFICATION_TTL = timedelta(hours=24)
EMAIL_RESEND_COOLDOWN = timedelta(seconds=60)
PASSWORD_RESET_TTL = timedelta(minutes=30)
PASSWORD_RESET_COOLDOWN = timedelta(seconds=60)

auth_router = APIRouter()
user_service = UserService()
token_blocklist_service = TokenBlocklistService()
role_checker = RoleChecker(["admin", "customer", "vendor"])
admin_only_dependency = Depends(RoleChecker(["admin"]))
session_dependency = Depends(get_session)
refresh_token_dependency = Depends(RefreshTokenBearer())
access_token_dependency = Depends(AccessTokenBearer())
current_user_dependency = Depends(get_verified_user)
role_dependency = Depends(role_checker)


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=Config.REFRESH_COOKIE_NAME,
        value=token,
        max_age=REFRESH_TOKEN_EXPIRY * 24 * 60 * 60,
        httponly=True,
        secure=Config.COOKIE_SECURE,
        samesite=Config.COOKIE_SAMESITE,
        path=Config.REFRESH_COOKIE_PATH,
    )


def build_verification_message(email: str, raw_token: str):
    frontend_url = Config.FRONTEND_URL.rstrip("/")
    # Fragments stay out of web-server, proxy, and API logs. Verification is
    # confirmed explicitly in the browser so email security scanners cannot
    # consume the one-time token simply by opening the link.
    link = f"{frontend_url}/verify-email#token={quote(raw_token, safe='')}"
    html_message = f"""
    <h1>Verify your email</h1>
    <p>Please click <a href="{link}">here</a> to verify your email address.</p>
    <p>This link expires in 24 hours and can only be used once.</p>
    """
    return create_message(
        recipients=[email],
        subject="Verify your Tavilo email",
        body=html_message,
    )


@auth_router.post("/send_email", dependencies=[admin_only_dependency])
async def send_email(emails: EmailModel):
    emails = emails.addresses

    html = "<h1>Welcome to Tavilo</h1>"

    message = create_message(
        recipients=emails,
        subject="Welcome",
        body=html,
    )

    try:
        await deliver_message(message, event="manual_email")
    except EmailDeliveryError as exc:
        raise EmailDeliveryUnavailable() from exc

    return {"message": "Email sent Successfully"}


@auth_router.post("/signup", status_code=status.HTTP_202_ACCEPTED)
async def create_user_account(
    user_data: UserCreateModel,
    bg_tasks: BackgroundTasks,
    session: AsyncSession = session_dependency,
):
    """Create user account using email, username, first_name, last_name."""

    email = normalize_email(user_data.email)
    user_data = user_data.model_copy(update={"email": email})

    existing_user = await user_service.get_user_by_email(email, session)
    if existing_user and existing_user.is_verified:
        raise UserAlreadyExists()

    if not existing_user and await user_service.username_exists(user_data.username, session):
        raise UserAlreadyExists()

    now = datetime.now(timezone.utc)
    pending_result = await session.exec(
        select(PendingRegistration).where(PendingRegistration.email == email)
    )
    pending = pending_result.first()
    if pending:
        if pending.token_expires_at > now:
            return {
                "message": "Check your email to finish creating your Tavilo account.",
            }
        await session.delete(pending)
        await session.flush()

    raw_token, token_hash = create_email_verification_token()
    if existing_user:
        pending_values = {
            "email": existing_user.email,
            "username": existing_user.username,
            "first_name": existing_user.first_name,
            "last_name": existing_user.last_name,
            "password_hash": existing_user.password_hash,
        }
    else:
        pending_values = {
            "email": email,
            "username": user_data.username,
            "first_name": user_data.first_name,
            "last_name": user_data.last_name,
            "password_hash": generate_passwd_hash(user_data.password),
        }
    pending = PendingRegistration(
        **pending_values,
        verification_token_hash=token_hash,
        token_expires_at=now + EMAIL_VERIFICATION_TTL,
        last_sent_at=now,
        created_at=now,
    )
    session.add(pending)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise UserAlreadyExists() from exc

    bg_tasks.add_task(
        deliver_message_in_background,
        build_verification_message(email, raw_token),
        event="email_verification",
    )

    return {
        "message": "Check your email to finish creating your Tavilo account.",
    }


@auth_router.post("/verify")
async def verify_user_account(
    verification: EmailVerificationTokenModel,
    session: AsyncSession = session_dependency,
):
    """Consume a verification token after an explicit user confirmation."""
    token = verification.token.strip()
    now = datetime.now(timezone.utc)
    token_hash = hash_email_verification_token(token)
    result = await session.exec(
        select(PendingRegistration).where(
            PendingRegistration.verification_token_hash == token_hash
        )
    )
    pending = result.first()

    if not pending or pending.token_expires_at <= now:
        if pending:
            await session.delete(pending)
            await session.commit()
        # Old frontend links placed an earlier signed token in the URL path.
        # They now arrive here only after the same explicit confirmation step.
        legacy_data = decode_url_safe_token(token, max_age=24 * 60 * 60)
        if legacy_data and legacy_data.get("purpose") == "email-verification":
            legacy_email = legacy_data.get("email")
            if legacy_email:
                legacy_user = await user_service.get_user_by_email(
                    normalize_email(legacy_email), session
                )
                if legacy_user:
                    if not legacy_user.is_verified:
                        await user_service.update_user(
                            legacy_user, {"is_verified": True}, session
                        )
                    return JSONResponse(
                        content={"message": "Email verified successfully"},
                        status_code=status.HTTP_200_OK,
                    )
        raise InvalidVerificationToken()

    existing_user = await user_service.get_user_by_email(pending.email, session)
    if existing_user:
        if not existing_user.is_verified:
            existing_user.is_verified = True
            existing_user.updated_at = now
        await session.delete(pending)
        await session.commit()
        return JSONResponse(
            content={"message": "Email verified successfully"},
            status_code=status.HTTP_200_OK,
        )

    user = User(
        username=pending.username,
        email=pending.email,
        first_name=pending.first_name,
        last_name=pending.last_name,
        password_hash=pending.password_hash,
        role="customer",
        is_verified=True,
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    await session.delete(pending)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise UserAlreadyExists() from exc

    return JSONResponse(
        content={"message": "Account verified and created successfully"},
        status_code=status.HTTP_200_OK,
    )


@auth_router.post("/resend-verification")
async def resend_verification(
    email_data: PasswordResetRequestModel,
    bg_tasks: BackgroundTasks,
    session: AsyncSession = session_dependency,
):
    """Resend a pending verification email without revealing account state."""
    generic_response = JSONResponse(
        content={
            "message": "If a pending signup exists for that email, a verification link will be sent.",
        },
        status_code=status.HTTP_200_OK,
    )
    email = normalize_email(email_data.email)
    result = await session.exec(
        select(PendingRegistration).where(PendingRegistration.email == email)
    )
    pending = result.first()
    legacy_user = None
    if not pending:
        legacy_user = await user_service.get_user_by_email(email, session)
        if not legacy_user or legacy_user.is_verified:
            return generic_response

    now = datetime.now(timezone.utc)
    if pending and pending.last_sent_at + EMAIL_RESEND_COOLDOWN > now:
        return generic_response

    raw_token, token_hash = create_email_verification_token()
    if pending:
        pending.verification_token_hash = token_hash
        pending.token_expires_at = now + EMAIL_VERIFICATION_TTL
        pending.last_sent_at = now
    else:
        pending = PendingRegistration(
            email=legacy_user.email,
            username=legacy_user.username,
            first_name=legacy_user.first_name,
            last_name=legacy_user.last_name,
            password_hash=legacy_user.password_hash,
            verification_token_hash=token_hash,
            token_expires_at=now + EMAIL_VERIFICATION_TTL,
            last_sent_at=now,
            created_at=now,
        )
    session.add(pending)
    await session.commit()

    bg_tasks.add_task(
        deliver_message_in_background,
        build_verification_message(email, raw_token),
        event="email_verification_resend",
    )
    return generic_response


@auth_router.post("/login")
async def login_users(
    login_data: UserLoginModel, session: AsyncSession = session_dependency
):
    email = normalize_email(login_data.email)
    password = login_data.password

    user = await user_service.get_user_by_email(email, session)

    if user is not None:
        password_valid = verify_password(password, user.password_hash)

        if password_valid:
            if not user.is_verified:
                raise AccountNotVerified()

            if user.role == "admin":
                await record_audit(
                    session,
                    "admin.login",
                    actor_user_id=user.uid,
                    metadata={"success": True},
                )
                await session.commit()
            access_token = create_access_tokens(
                user_data={
                    "email": user.email,
                    "user_uid": str(user.uid),
                    "role": user.role,
                    "session_version": user.session_version,
                }
            )

            refresh_token = create_access_tokens(
                user_data={
                    "email": user.email,
                    "user_uid": str(user.uid),
                    "session_version": user.session_version,
                },
                refresh=True,
                expiry=timedelta(days=REFRESH_TOKEN_EXPIRY),
            )

            response = JSONResponse(
                content={
                    "message": "Login successful",
                    "access_token": access_token,
                    "user": {
                        "email": user.email,
                        "uid": str(user.uid),
                        "role": user.role,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                    },
                }
            )
            set_refresh_cookie(response, refresh_token)
            return response

    raise InvalidCredentials()


@auth_router.post("/refresh_token")  # Changed from GET to POST
async def get_new_access_token(
    token_details: dict = refresh_token_dependency,
    session: AsyncSession = session_dependency,
):
    expiry_timestamp = token_details["exp"]

    if datetime.fromtimestamp(expiry_timestamp, tz=timezone.utc) > datetime.now(timezone.utc):
        # Re-read user from DB so the new access token always carries the current role
        token_user = token_details.get("user")
        if not isinstance(token_user, dict):
            raise InvalidToken()
        user = await user_service.get_user_by_uid(token_user.get("user_uid"), session)

        if (
            not user
            or user.email != token_user.get("email")
            or user.session_version != token_details.get("sv")
        ):
            raise InvalidToken()

        if not user.is_verified:
            raise AccountNotVerified()

        new_access_token = create_access_tokens(
            user_data={
                "email": user.email,
                "user_uid": str(user.uid),
                "role": user.role,
                "session_version": user.session_version,
            }
        )

        await token_blocklist_service.revoke_token(
            token_details["jti"],
            datetime.fromtimestamp(token_details["exp"], tz=timezone.utc),
            session,
        )
        new_refresh_token = create_access_tokens(
            user_data={
                "email": user.email,
                "user_uid": str(user.uid),
                "session_version": user.session_version,
            },
            refresh=True,
            expiry=timedelta(days=REFRESH_TOKEN_EXPIRY),
        )
        response = JSONResponse(content={
            "access_token": new_access_token,
            "user": {
                "email": user.email,
                "uid": str(user.uid),
                "role": user.role,
                "first_name": user.first_name,
                "last_name": user.last_name,
            },
        })
        set_refresh_cookie(response, new_refresh_token)
        return response

    raise InvalidToken()


@auth_router.get("/me", response_model=UserModel)
async def get_current_user_me(user=current_user_dependency, _: bool = role_dependency):
    return user


@auth_router.post("/logout")  # Changed from GET to POST
async def revoke_token(
    request: Request,
    token_details: dict = access_token_dependency,
    session: AsyncSession = session_dependency,
):
    jti = token_details["jti"]

    await token_blocklist_service.revoke_token(
        jti,
        datetime.fromtimestamp(token_details["exp"], tz=timezone.utc),  # Fixed: timezone.utc
        session,
    )
    refresh_token = request.cookies.get(Config.REFRESH_COOKIE_NAME) if request else None
    if refresh_token:
        refresh_details = decode_token(refresh_token)
        if refresh_details and refresh_details.get("refresh"):
            await token_blocklist_service.revoke_token(
                refresh_details["jti"],
                datetime.fromtimestamp(refresh_details["exp"], tz=timezone.utc),
                session,
            )

    response = JSONResponse(
        content={"message": "Logged out successfully"}, status_code=status.HTTP_200_OK
    )
    response.delete_cookie(
        key=Config.REFRESH_COOKIE_NAME,
        path=Config.REFRESH_COOKIE_PATH,
    )
    return response


@auth_router.post("/password-reset-request")
async def password_reset_request(
    email_data: PasswordResetRequestModel,
    bg_tasks: BackgroundTasks,
    session: AsyncSession = session_dependency,
):
    email = normalize_email(email_data.email)

    # Always return the same response — do not reveal whether the email exists
    SUCCESS_RESPONSE = JSONResponse(
        content={
            "message": "If that email is registered, you will receive a password reset link shortly.",
        },
        status_code=status.HTTP_200_OK,
    )

    # Do not disclose whether an account exists.  For a real, verified account
    # rotate every outstanding credential so only the newest email can work.
    user = await user_service.get_user_by_email(email, session)
    if not user or not user.is_verified:
        return SUCCESS_RESPONSE

    now = datetime.now(timezone.utc)
    recent = await session.exec(
        select(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.uid,
            PasswordResetToken.created_at > now - PASSWORD_RESET_COOLDOWN,
        )
        .order_by(PasswordResetToken.created_at.desc())
    )
    if recent.first():
        return SUCCESS_RESPONSE

    # A token is random and opaque.  The database only receives a SHA-256
    # digest, so a database read cannot be used to reset an account.
    raw_token, token_hash = create_password_reset_token()
    await session.exec(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.uid,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    session.add(
        PasswordResetToken(
            user_id=user.uid,
            token_hash=token_hash,
            expires_at=now + PASSWORD_RESET_TTL,
            created_at=now,
        )
    )
    # Remove expired rows opportunistically without retaining security
    # credentials indefinitely.
    await session.exec(
        delete(PasswordResetToken).where(
            PasswordResetToken.expires_at <= now,
        )
    )
    await session.commit()

    # The fragment is never sent in HTTP requests, avoiding browser, proxy,
    # server and API request-path logs.  The frontend POSTs it in the body.
    link = f"{Config.FRONTEND_URL.rstrip('/')}/reset-password#token={quote(raw_token, safe='')}"

    html_message = f"""
    <h1>Reset Your Password</h1>
    <p>Please click <a href="{link}">here</a> to reset your password.</p>
    <p>This link expires in 30 minutes and can only be used once.</p>
    """
    subject = "Reset Your Password"

    message = create_message(
        recipients=[email],
        subject=subject,
        body=html_message,
    )

    # Queue delivery after the response is sent. This keeps the endpoint fast
    # while the background helper still swallows delivery failures.
    bg_tasks.add_task(deliver_message_in_background, message, event="password_reset")

    return SUCCESS_RESPONSE


@auth_router.post("/password-reset-confirm")
async def reset_account_password(
    passwords: PasswordResetConfirmModel,
    session: AsyncSession = session_dependency,
):
    new_password = passwords.new_password
    confirm_password = passwords.confirm_new_password

    if new_password != confirm_password:
        return JSONResponse(
            content={"message": "Passwords do not match", "error_code": "password_mismatch"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    now = datetime.now(timezone.utc)
    token_hash = hash_password_reset_token(passwords.token)
    result = await session.exec(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash)
        .with_for_update()
    )
    reset_token = result.first()
    if (
        not reset_token
        or reset_token.used_at is not None
        or reset_token.expires_at <= now
    ):
        raise InvalidToken()

    # Lock the user too.  This makes reset-token consumption, password change,
    # and global session invalidation one atomic transaction.
    user_result = await session.exec(
        select(User).where(User.uid == reset_token.user_id).with_for_update()
    )
    user = user_result.first()
    if not user:
        raise InvalidToken()

    user.password_hash = generate_passwd_hash(new_password)
    user.session_version += 1
    reset_token.used_at = now
    # Do not leave a second active token usable after a successful reset.
    await session.exec(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.uid,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    await record_audit(
        session,
        "auth.password_reset",
        actor_user_id=user.uid,
        target_type="user",
        target_id=str(user.uid),
    )
    await session.commit()

    return JSONResponse(
        content={"message": "Password reset successfully"},
        status_code=status.HTTP_200_OK,
    )
