from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import select

from src.auth.dependencies import get_current_user
from src.auth.utils import (
    create_access_tokens,
    create_password_reset_token,
    decode_token,
    generate_passwd_hash,
    verify_password,
)
from src.db.models import PasswordResetToken, User, Vendor
from src.errors import InvalidToken


API_VENDORS = "/api/v1/vendors"
API_PRODUCTS = "/api/v1/products"


async def _create_user(session, *, username: str, role: str = "customer") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        first_name="Test",
        last_name="User",
        role=role,
        is_verified=True,
        password_hash=generate_passwd_hash("old-password"),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_admin_approval_and_suspension_are_atomic_and_return_the_actor(
    client, session_factory
):
    async with session_factory() as session:
        admin = await _create_user(session, username="admin", role="admin")
        applicant = await _create_user(session, username="applicant")

    application = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(applicant.uid)},
        json={"store_name": "Applicant Store", "slug": "applicant-store"},
    )
    assert application.status_code == 201
    vendor_id = application.json()["uid"]

    approved = await client.patch(
        f"{API_VENDORS}/admin/{vendor_id}/approve",
        headers={"X-Test-User": str(admin.uid)},
    )
    assert approved.status_code == 200, approved.text

    async with session_factory() as session:
        vendor = await session.get(Vendor, vendor_id)
        updated_user = await session.get(User, applicant.uid)
        assert vendor.status == "approved"
        assert updated_user.role == "vendor"
        assert updated_user.session_version == 1

    suspended = await client.patch(
        f"{API_VENDORS}/admin/{vendor_id}/suspend",
        headers={"X-Test-User": str(admin.uid)},
    )
    assert suspended.status_code == 200, suspended.text

    # The former vendor remains a customer, but no longer receives seller
    # capability merely because a vendor profile remains in the database.
    denied = await client.get(
        f"{API_PRODUCTS}/vendor/me", headers={"X-Test-User": str(applicant.uid)}
    )
    assert denied.status_code in (401, 403)


@pytest.mark.asyncio
async def test_password_reset_is_one_time_and_invalidates_all_sessions(
    client, session_factory
):
    async with session_factory() as session:
        user = await _create_user(session, username="reset-user")
        old_access_token = create_access_tokens(
            {
                "email": user.email,
                "user_uid": str(user.uid),
                "role": user.role,
                "session_version": user.session_version,
            }
        )
        raw_token, token_hash = create_password_reset_token()
        session.add(
            PasswordResetToken(
                user_id=user.uid,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
        )
        await session.commit()

    payload = {
        "token": raw_token,
        "new_password": "a-new-strong-password",
        "confirm_new_password": "a-new-strong-password",
    }
    completed = await client.post("/api/v1/auth/password-reset-confirm", json=payload)
    assert completed.status_code == 200, completed.text

    reused = await client.post("/api/v1/auth/password-reset-confirm", json=payload)
    assert reused.status_code == 401

    async with session_factory() as session:
        updated_user = await session.get(User, user.uid)
        token = (
            await session.exec(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
        ).one()
        assert updated_user.session_version == 1
        assert verify_password("a-new-strong-password", updated_user.password_hash)
        assert token.used_at is not None
        with pytest.raises(InvalidToken):
            await get_current_user(decode_token(old_access_token), session)
