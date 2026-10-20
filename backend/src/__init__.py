from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from src.addresses.routes import address_router
from src.admin.routes import admin_router
from src.auth.routers import auth_router
from src.cart.routes import cart_router
from src.categories.routes import category_router
from src.config import Config, configure_application_logging
from src.db.main import async_engine, check_db_connection, init_db
from src.orders.routes import order_router
from src.products.image_storage import PRODUCT_IMAGE_DIR
from src.products.routes import product_router, serve_product_image
from src.reviews.routes import product_review_router
from src.services.routes import service_router
from src.vendors.routes import vendor_router
from src.wishlist.routes import wishlist_router

from .errors import register_all_errors
from .middleware import register_middleware


configure_application_logging(app_env=Config.APP_ENV, log_level=Config.LOG_LEVEL)
logger = logging.getLogger("tavilo.application")


@asynccontextmanager
async def life_span(app: FastAPI):
    logger.info("Server is starting")
    # Alembic owns schema changes in production.  Keeping create_all limited
    # to local development prevents concurrent workers from racing migrations
    # and makes schema drift visible instead of silently masking it.
    if Config.APP_ENV.strip().lower() in {"development", "dev", "test"}:
        await init_db()
    else:
        await check_db_connection()
    try:
        yield
    finally:
        await async_engine.dispose()
        logger.info("Server is stopping")


version = "v1"
API_PREFIX = f"/api/{version}"

app = FastAPI(
    title="Tavilo API",
    description="Tavilo multi-vendor shopping REST API",
    version=version,
    lifespan=life_span,
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    contact={"email": "sharmasuprabh2608@gmail.com"},
)
PRODUCT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
app.add_api_route(
    "/media/products/{filename}",
    serve_product_image,
    methods=["GET"],
    name="secure_legacy_product_image",
)

register_all_errors(app)
register_middleware(app)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return JSONResponse({"status": "ok", "version": version})


@app.get("/ready", tags=["health"])
async def ready():
    try:
        await check_db_connection()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable") from exc
    return JSONResponse({"status": "ready", "version": version})


# ── Router mounts under /api/v1 ───────────────────────────────────────────────
app.include_router(auth_router,     prefix=f"{API_PREFIX}/auth",       tags=["auth"])
app.include_router(product_review_router, prefix=f"{API_PREFIX}",     tags=["reviews"])
app.include_router(service_router,  prefix=f"{API_PREFIX}/services",   tags=["services"])
app.include_router(category_router, prefix=f"{API_PREFIX}/categories", tags=["categories"])
app.include_router(product_router,  prefix=f"{API_PREFIX}/products",   tags=["products"])
app.include_router(vendor_router,   prefix=f"{API_PREFIX}/vendors",    tags=["vendors"])
app.include_router(cart_router,     prefix=f"{API_PREFIX}/cart",       tags=["cart"])
app.include_router(wishlist_router, prefix=f"{API_PREFIX}/wishlist",   tags=["wishlist"])
app.include_router(address_router,  prefix=f"{API_PREFIX}/addresses",  tags=["addresses"])
app.include_router(order_router,    prefix=f"{API_PREFIX}/orders",     tags=["orders"])
app.include_router(admin_router,    prefix=f"{API_PREFIX}/admin",      tags=["admin"])
