"""Redis-backed, privacy-preserving limits for authentication endpoints."""

import hashlib
import hmac
import logging
import secrets
import time
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError

from src.config import Config
from src.errors import RateLimitUnavailable

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitPolicy:
    window_seconds: int
    max_attempts: int
    lockout_seconds: int


LOGIN_POLICY = RateLimitPolicy(window_seconds=600, max_attempts=10, lockout_seconds=900)
RESET_POLICY = RateLimitPolicy(window_seconds=3600, max_attempts=5, lockout_seconds=3600)
SIGNUP_POLICY = RateLimitPolicy(window_seconds=3600, max_attempts=5, lockout_seconds=3600)
VERIFICATION_POLICY = RateLimitPolicy(
    window_seconds=3600, max_attempts=3, lockout_seconds=3600
)

# This script checks and consumes an attempt atomically across all workers.
_CONSUME_SCRIPT = """
local lock_until = redis.call('GET', KEYS[2])
local now = tonumber(ARGV[1])
if lock_until and tonumber(lock_until) > now then
    return {0, math.ceil(tonumber(lock_until) - now)}
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[2]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
    local until_time = now + tonumber(ARGV[4])
    redis.call('SET', KEYS[2], until_time, 'EX', tonumber(ARGV[4]))
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
    return {0, tonumber(ARGV[4])}
end
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return {1, 0}
"""

_redis: Redis | None = None


def _bucket_digest(scope: str, identifier: str) -> str:
    """Create a non-reversible bucket ID; Redis and logs never receive PII."""
    value = f"{scope}\\0{identifier.strip().casefold()}".encode("utf-8")
    secret = (Config.RATE_LIMIT_KEY_SECRET or f"ratelimit:v1:{Config.JWT_SECRET}").encode("utf-8")
    return hmac.new(secret, value, hashlib.sha256).hexdigest()


def _keys(scope: str, identifier: str) -> tuple[str, str]:
    digest = _bucket_digest(scope, identifier)
    prefix = f"tavilo:ratelimit:v1:{scope}:{digest}"
    return f"{prefix}:attempts", f"{prefix}:lock"


async def initialize_rate_limiter(client: Redis | None = None) -> None:
    """Connect at startup so production never silently falls back to memory."""
    global _redis
    if client is not None:
        if _redis is not None:
            await _redis.aclose()
        _redis = client
        return
    client = Redis.from_url(Config.REDIS_URL, encoding="utf-8", decode_responses=True)
    try:
        await client.ping()
    except RedisError as exc:
        await client.aclose()
        raise RuntimeError("Redis is required for authentication rate limiting") from exc
    if _redis is not None:
        await _redis.aclose()
    _redis = client


async def shutdown_rate_limiter() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def check_redis_connection() -> None:
    """Readiness check to verify Redis responsiveness."""
    if _redis is None:
        raise RuntimeError("Redis rate limiter is not initialized")
    await _redis.ping()


async def _consume(scope: str, identifier: str, policy: RateLimitPolicy) -> tuple[bool, int]:
    if _redis is None:
        logger.error("rate_limit_unavailable scope=%s reason=not_initialized", scope)
        raise RateLimitUnavailable()

    attempts_key, lock_key = _keys(scope, identifier)
    now = time.time()
    try:
        result = await _redis.eval(
            _CONSUME_SCRIPT,
            2,
            attempts_key,
            lock_key,
            now,
            policy.window_seconds,
            policy.max_attempts,
            policy.lockout_seconds,
            f"{now:.6f}:{secrets.token_urlsafe(8)}",
        )
    except RedisError as exc:
        logger.error("rate_limit_unavailable scope=%s reason=redis_error", scope)
        raise RateLimitUnavailable() from exc

    allowed, retry_after = bool(int(result[0])), int(result[1])
    if not allowed:
        # Never log an IP, email, hash, or Redis key.
        logger.warning("rate_limit_blocked scope=%s", scope)
    return allowed, retry_after


async def check_login_rate(identifier: str) -> tuple[bool, int]:
    return await _consume("login", identifier, LOGIN_POLICY)


async def check_reset_rate(identifier: str) -> tuple[bool, int]:
    return await _consume("password_reset", identifier, RESET_POLICY)


async def check_signup_rate(identifier: str) -> tuple[bool, int]:
    return await _consume("signup", identifier, SIGNUP_POLICY)


async def check_verification_rate(identifier: str) -> tuple[bool, int]:
    return await _consume("verification", identifier, VERIFICATION_POLICY)


async def clear_login_attempts(identifier: str) -> None:
    """Clear a successful login's bucket without exposing its identifier."""
    if _redis is None:
        logger.error("rate_limit_unavailable scope=login reason=not_initialized")
        raise RateLimitUnavailable()
    attempts_key, lock_key = _keys("login", identifier)
    try:
        await _redis.delete(attempts_key, lock_key)
    except RedisError as exc:
        logger.error("rate_limit_unavailable scope=login reason=redis_error")
        raise RateLimitUnavailable() from exc