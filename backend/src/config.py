import json
import logging
import sys
import time
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict # type: ignore

BASE_DIR = Path(__file__).resolve().parent.parent


class JsonFormatter(logging.Formatter):
    """Emit one structured, UTC JSON record per line for production logs."""

    converter = time.gmtime

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        http_fields = (
            "http_method",
            "http_path",
            "http_status_code",
            "http_duration_ms",
            "client_ip",
        )
        if any(hasattr(record, field) for field in http_fields):
            payload["http"] = {
                "method": getattr(record, "http_method", None),
                "path": getattr(record, "http_path", None),
                "status_code": getattr(record, "http_status_code", None),
                "duration_ms": getattr(record, "http_duration_ms", None),
                "client_ip": getattr(record, "client_ip", None),
            }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def _create_console_handler(app_env: str) -> logging.Handler:
    """Create a stdout handler suitable for terminals and container collectors."""
    handler = logging.StreamHandler(sys.stdout)
    if app_env.strip().lower() in {"production", "prod"}:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
    return handler


def configure_http_access_logging(*, app_env: str, log_level: str) -> logging.Logger:
    """Create a dedicated HTTP logger that does not depend on Uvicorn logging."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    if not isinstance(level, int):
        level = logging.INFO

    logger = logging.getLogger("tavilo.http")
    logger.setLevel(level)
    logger.propagate = False
    if not any(getattr(handler, "_tavilo_http_handler", False) for handler in logger.handlers):
        handler = _create_console_handler(app_env)
        handler._tavilo_http_handler = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    return logger

def configure_application_logging(*, app_env: str, log_level: str) -> None:
    """Configure Tavilo logs without replacing Uvicorn's own handlers."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    if not isinstance(level, int):
        level = logging.INFO

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    if any(getattr(handler, "_tavilo_handler", False) for handler in root_logger.handlers):
        return

    handler = _create_console_handler(app_env)
    handler._tavilo_handler = True  # type: ignore[attr-defined]
    root_logger.addHandler(handler)


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str
    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    MAIL_FROM: str
    MAIL_PORT: int
    MAIL_SERVER: str
    MAIL_FROM_NAME: str
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True
    DOMAIN: str
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str
    TRUSTED_HOSTS: str
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    ADMIN_BOOTSTRAP_PASSWORD: str | None = None
    REFRESH_COOKIE_NAME: str = "tavilo_refresh"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    REDIS_URL: str = "redis://redis:6379/0"
    # Set this independently on the next secrets rotation. The safe default
    # remains domain-separated from JWT signing material.
    RATE_LIMIT_KEY_SECRET: str | None = None
    TRUSTED_PROXY_CIDRS: str = "127.0.0.1/32,::1/128"
    MAX_ADDRESSES_PER_USER: int = 20

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        """Refuse deployment settings that would expose bearer credentials."""
        if self.APP_ENV.lower() not in {"production", "prod"}:
            return self

        if len(self.JWT_SECRET) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters in production")
        if not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE must be true in production")
        if not self.FRONTEND_URL.startswith("https://"):
            raise ValueError("FRONTEND_URL must use HTTPS in production")
        if "*" in {item.strip() for item in self.CORS_ORIGINS.split(",")}:
            raise ValueError("CORS_ORIGINS cannot contain '*' in production")
        if "*" in {item.strip() for item in self.TRUSTED_HOSTS.split(",")}:
            raise ValueError("TRUSTED_HOSTS cannot contain '*' in production")
        if not self.REDIS_URL:
            raise ValueError("REDIS_URL must be configured in production")
        if not 1 <= self.MAX_ADDRESSES_PER_USER <= 100:
            raise ValueError("MAX_ADDRESSES_PER_USER must be between 1 and 100")
        if self.RATE_LIMIT_KEY_SECRET is None:
            self.RATE_LIMIT_KEY_SECRET = f"ratelimit:v1:{self.JWT_SECRET}"
        return self

    # Resolve the env file from the backend package, not the process cwd.
    # This keeps uvicorn, Alembic, and Docker consistent when started elsewhere.
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        extra="ignore",
    )


Config = Settings()
