"""Comprehensive production verification tests for Redis rate limiting and client IP resolution."""

from unittest.mock import MagicMock
import pytest
import pytest_asyncio
import fakeredis.aioredis as fredis

from fastapi import Request
from httpx import ASGITransport, AsyncClient

from src import app
from src.auth.client_ip import get_client_ip
from src.auth.rate_limit import (
    LOGIN_POLICY,
    RESET_POLICY,
    _bucket_digest,
    _keys,
    check_login_rate,
    check_redis_connection,
    check_reset_rate,
    clear_login_attempts,
    initialize_rate_limiter,
    shutdown_rate_limiter,
)
from src.config import Config
from src.db.models import User
from src.errors import RateLimitUnavailable
from src.auth.utils import generate_passwd_hash


def _mock_request(client_host: str | None = None, headers: dict | None = None) -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
    }
    if client_host is not None:
        scope["client"] = (client_host, 50000)
    else:
        scope["client"] = None
    return Request(scope)


# ── Client IP Resolution Tests ───────────────────────────────────────────────

def test_client_ip_direct_peer():
    """Direct peer IP is used when no trusted reverse proxy is present."""
    req = _mock_request(client_host="203.0.113.10")
    assert get_client_ip(req) == "203.0.113.10"


def test_client_ip_ignores_spoofed_header_from_untrusted_peer():
    """An attacker connecting directly cannot spoof X-Real-IP."""
    req = _mock_request(
        client_host="198.51.100.20",
        headers={"X-Real-IP": "1.1.1.1"},
    )
    # Must ignore 1.1.1.1 and use 198.51.100.20
    assert get_client_ip(req) == "198.51.100.20"


def test_client_ip_trusted_proxy_forwarded():
    """X-Real-IP is accepted only from peers in TRUSTED_PROXY_CIDRS."""
    # 127.0.0.1 is in TRUSTED_PROXY_CIDRS by default
    req = _mock_request(
        client_host="127.0.0.1",
        headers={"X-Real-IP": "203.0.113.50"},
    )
    assert get_client_ip(req) == "203.0.113.50"


def test_client_ip_trusted_proxy_strips_whitespace():
    """Surrounding whitespace in X-Real-IP is cleanly handled."""
    req = _mock_request(
        client_host="127.0.0.1",
        headers={"X-Real-IP": "  203.0.113.50  "},
    )
    assert get_client_ip(req) == "203.0.113.50"


def test_client_ip_trusted_proxy_malformed_header():
    """Malformed X-Real-IP from proxy falls back safely to proxy peer IP."""
    req = _mock_request(
        client_host="127.0.0.1",
        headers={"X-Real-IP": "not-a-valid-ip"},
    )
    assert get_client_ip(req) == "127.0.0.1"


def test_client_ip_missing_client():
    """Requests with no client scope return 'unknown'."""
    req = _mock_request(client_host=None)
    assert get_client_ip(req) == "unknown"


# ── Privacy and Digest Invariants ───────────────────────────────────────────

def test_bucket_digest_privacy_and_normalization():
    """Digest must be irreversible, 64-char hex, normalized, and domain-separated."""
    d1 = _bucket_digest("login", "User@Example.COM")
    d2 = _bucket_digest("login", "user@example.com")
    d3 = _bucket_digest("login", "  user@example.com  ")
    assert d1 == d2 == d3
    assert len(d1) == 64
    assert "user@example.com" not in d1

    # Domain separation: same identifier in different scope yields different digest
    d_reset = _bucket_digest("password_reset", "user@example.com")
    assert d1 != d_reset

    k_attempts, k_lock = _keys("login", "user@example.com")
    assert k_attempts == f"tavilo:ratelimit:v1:login:{d1}:attempts"
    assert k_lock == f"tavilo:ratelimit:v1:login:{d1}:lock"


# ── Fail-Closed Behavior ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limiter_fails_closed_when_uninitialized():
    """If Redis is not initialized, rate limiter must fail closed (raise RateLimitUnavailable)."""
    await shutdown_rate_limiter()
    with pytest.raises(RateLimitUnavailable):
        await check_login_rate("user@example.com")
    with pytest.raises(RateLimitUnavailable):
        await check_reset_rate("user@example.com")
    with pytest.raises(RateLimitUnavailable):
        await clear_login_attempts("user@example.com")
    with pytest.raises(RuntimeError, match="not initialized"):
        await check_redis_connection()


# ── Sliding Window & Lockout Tests with FakeRedis ───────────────────────────

@pytest_asyncio.fixture
async def fake_redis():
    client = fredis.FakeRedis(decode_responses=True)
    await initialize_rate_limiter(client=client)
    yield client
    await shutdown_rate_limiter()


@pytest.mark.asyncio
async def test_login_rate_limiter_allows_under_limit_and_locks_out(fake_redis):
    """LOGIN_POLICY allows 10 attempts, then locks out for 900s."""
    identifier = "login:email:target@example.com"

    # Attempts 1 through 10 must succeed
    for _ in range(10):
        allowed, retry_after = await check_login_rate(identifier)
        assert allowed is True
        assert retry_after == 0

    # 11th attempt exceeds max_attempts (10) -> lockout
    allowed, retry_after = await check_login_rate(identifier)
    assert allowed is False
    assert retry_after == LOGIN_POLICY.lockout_seconds

    # 12th attempt while locked -> still blocked
    allowed, retry_after2 = await check_login_rate(identifier)
    assert allowed is False
    assert 0 < retry_after2 <= LOGIN_POLICY.lockout_seconds

    # Clearing attempts resets the lockout
    await clear_login_attempts(identifier)
    allowed, retry_after = await check_login_rate(identifier)
    assert allowed is True
    assert retry_after == 0


@pytest.mark.asyncio
async def test_reset_rate_limiter_allows_5_and_locks_out(fake_redis):
    """RESET_POLICY allows 5 attempts, then locks out for 3600s."""
    identifier = "email:user@example.com"

    for _ in range(5):
        allowed, retry_after = await check_reset_rate(identifier)
        assert allowed is True
        assert retry_after == 0

    # 6th attempt blocked
    allowed, retry_after = await check_reset_rate(identifier)
    assert allowed is False
    assert retry_after == RESET_POLICY.lockout_seconds


# ── API Endpoint Integration Tests ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_endpoint_enforces_rate_limit(client, session_factory, fake_redis):
    """POST /api/v1/auth/login returns 429 with Retry-After when rate limit is exceeded."""
    email = "ratelimit_target@example.com"
    async with session_factory() as session:
        user = User(
            username="ratelimit_user",
            email=email,
            first_name="Rate",
            last_name="Limit",
            role="customer",
            is_verified=True,
            password_hash=generate_passwd_hash("correct_password"),
        )
        session.add(user)
        await session.commit()

    # Submit 10 bad password attempts (HTTP 400 Invalid Credentials)
    for _ in range(10):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong_password"},
        )
        assert resp.status_code == 400

    # 11th attempt must be rejected by rate limiter (HTTP 429)
    blocked_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong_password"},
    )
    assert blocked_resp.status_code == 429
    assert blocked_resp.headers.get("Retry-After") is not None
    data = blocked_resp.json()
    assert data["error_code"] == "too_many_requests"
    assert "retry_after" in data


@pytest.mark.asyncio
async def test_login_endpoint_clears_counter_on_successful_auth(client, session_factory, fake_redis):
    """Successful login resets failure counters for both email and IP."""
    email = "reset_on_success@example.com"
    password = "CorrectPass#123"
    async with session_factory() as session:
        user = User(
            username="reset_on_success",
            email=email,
            first_name="Success",
            last_name="User",
            role="customer",
            is_verified=True,
            password_hash=generate_passwd_hash(password),
        )
        session.add(user)
        await session.commit()

    # Fail 5 times
    for _ in range(5):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong_password"},
        )
        assert resp.status_code == 400

    # Successful login
    success_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert success_resp.status_code == 200

    # Counters should be cleared; can make 10 more failed attempts without 429
    for _ in range(10):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong_password"},
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login_endpoint_fails_closed_when_redis_unavailable(client):
    """POST /api/v1/auth/login returns 503 when Redis is unavailable (fail-closed)."""
    await shutdown_rate_limiter()
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "any@example.com", "password": "password123"},
    )
    assert resp.status_code == 503
    assert resp.json()["error_code"] == "rate_limit_unavailable"


@pytest.mark.asyncio
async def test_password_reset_request_rate_limiting(client, session_factory, fake_redis):
    """POST /api/v1/auth/password-reset-request enforces rate limiting on IP and email."""
    for _ in range(5):
        resp = await client.post(
            "/api/v1/auth/password-reset-request",
            json={"email": "target_reset@example.com"},
        )
        assert resp.status_code == 200

    blocked = await client.post(
        "/api/v1/auth/password-reset-request",
        json={"email": "target_reset@example.com"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["error_code"] == "too_many_requests"


@pytest.mark.asyncio
async def test_readiness_probe_verifies_redis(client, fake_redis):
    """GET /ready returns 200 when DB and Redis are up, 503 when Redis is down."""
    ready_resp = await client.get("/ready")
    assert ready_resp.status_code == 200
    assert ready_resp.json()["status"] == "ready"

    # Simulate Redis outage
    await shutdown_rate_limiter()
    down_resp = await client.get("/ready")
    assert down_resp.status_code == 503
    assert "Redis is unavailable" in down_resp.json()["detail"]
