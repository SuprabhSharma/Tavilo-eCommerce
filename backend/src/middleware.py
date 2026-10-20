import logging
import time
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.requests import Request

from .config import Config, configure_http_access_logging

request_logger = configure_http_access_logging(
    app_env=Config.APP_ENV,
    log_level=Config.LOG_LEVEL,
)


def register_middleware(app: FastAPI):

    async def custom_logging(request: Request, call_next):
        start_time = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            processing_time = time.perf_counter() - start_time
            request_logger.exception(
                "HTTP %s %s failed in %.2fms",
                request.method,
                request.url.path,
                processing_time * 1000,
                extra={
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "http_status_code": 500,
                    "http_duration_ms": round(processing_time * 1000, 2),
                    "client_ip": request.client.host if request.client else "unknown",
                },
            )
            raise

        processing_time = time.perf_counter() - start_time
        client = request.client
        client_address = (
            f"{client.host}:{client.port}" if client is not None else "unknown"
        )
        request_logger.info(
            "HTTP %s %s -> %s in %.2fms",
            request.method,
            request.url.path,
            response.status_code,
            processing_time * 1000,
            extra={
                "http_method": request.method,
                "http_path": request.url.path,
                "http_status_code": response.status_code,
                "http_duration_ms": round(processing_time * 1000, 2),
                "client_ip": client_address,
            },
        )
        return response

    # Values are loaded from backend/.env through Config.
    # Do not combine allow_origins=["*"] with allow_credentials=True.
    cors_origins: List[str] = [
        origin.strip()
        for origin in Config.CORS_ORIGINS.split(",")
        if origin.strip()
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )

    trusted_hosts: List[str] = [
        host.strip()
        for host in Config.TRUSTED_HOSTS.split(",")
        if host.strip()
    ]

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=trusted_hosts,
    )

    # Register last so this logger wraps TrustedHost and CORS as well.
    app.middleware("http")(custom_logging)