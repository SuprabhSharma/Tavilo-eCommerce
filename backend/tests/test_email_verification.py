from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import select

from src.auth.utils import create_email_verification_token, generate_passwd_hash
from src.db.models import PendingRegistration, User


@pytest.mark.asyncio
async def test_verification_requires_explicit_post_and_consumes_token_once(
    client, session_factory
):
    """A link preview must not verify an account; an explicit POST may do so once."""
    raw_token, token_hash = create_email_verification_token()
    now = datetime.now(timezone.utc)

    async with session_factory() as session:
        session.add(
            PendingRegistration(
                email="verify@example.com",
                username="verify-user",
                first_name="Verify",
                last_name="User",
                password_hash=generate_passwd_hash("password"),
                verification_token_hash=token_hash,
                token_expires_at=now + timedelta(hours=24),
                last_sent_at=now,
                created_at=now,
            )
        )
        await session.commit()

    # No GET endpoint exists for consuming a token. This makes link previews
    # harmless even if a provider opens every link before the recipient.
    preview = await client.get(f"/api/v1/auth/verify/{raw_token}")
    assert preview.status_code == 404

    verified = await client.post("/api/v1/auth/verify", json={"token": raw_token})
    assert verified.status_code == 200

    async with session_factory() as session:
        user = (await session.exec(select(User).where(User.email == "verify@example.com"))).one()
        pending = (
            await session.exec(
                select(PendingRegistration).where(
                    PendingRegistration.email == "verify@example.com"
                )
            )
        ).first()

    assert user.is_verified is True
    assert pending is None

    reused = await client.post("/api/v1/auth/verify", json={"token": raw_token})
    assert reused.status_code == 400
    assert reused.json()["error_code"] == "invalid_verification_token"
