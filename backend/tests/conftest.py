import os
import sys
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import Depends, Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:Suprabh2608@localhost:5432/bookly_test",
)
os.environ.setdefault("JWT_SECRET", "test-secret-key-with-at-least-32-bytes")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("MAIL_USERNAME", "test@example.com")
os.environ.setdefault("MAIL_PASSWORD", "test")
os.environ.setdefault("MAIL_FROM", "test@example.com")
os.environ.setdefault("MAIL_PORT", "25")
os.environ.setdefault("MAIL_SERVER", "localhost")
os.environ.setdefault("MAIL_FROM_NAME", "Tavilo Tests")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("CORS_ORIGINS", "http://testserver")
os.environ.setdefault("TRUSTED_HOSTS", "testserver,localhost")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src import app  # noqa: E402
from src.auth.dependencies import get_verified_user  # noqa: E402
from src.db.main import get_session  # noqa: E402
from src.db.models import (  # noqa: E402
    Address,
    Cart,
    CartItem,
    Category,
    Product,
    User,
    Vendor,
)
from src.auth.utils import generate_passwd_hash  # noqa: E402


@pytest_asyncio.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(
        os.environ["DATABASE_URL"],
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_database(request, engine: AsyncEngine) -> AsyncIterator[None]:
    if request.node.get_closest_marker("no_db"):
        yield
        return
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    table_names = ", ".join(f'"{table.name}"' for table in reversed(SQLModel.metadata.sorted_tables))
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def session_factory(engine: AsyncEngine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def override_dependencies(request, session_factory):
    if request.node.get_closest_marker("no_db"):
        yield
        return

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def override_user(
        request: Request, session: AsyncSession = Depends(override_session)
    ):
        user_id = request.headers.get("X-Test-User")
        if not user_id:
            raise AssertionError("X-Test-User header is required in order tests")
        user = await session.get(User, uuid.UUID(user_id))
        if not user:
            raise AssertionError("test user does not exist")
        return user

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_verified_user] = override_user
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as value:
        yield value


async def create_customer(session: AsyncSession, *, username: str | None = None) -> User:
    suffix = uuid.uuid4().hex[:10]
    user = User(
        username=username or f"customer-{suffix}",
        email=f"customer-{suffix}@example.com",
        first_name="Test",
        last_name="Customer",
        role="customer",
        is_verified=True,
        password_hash=generate_passwd_hash("password"),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def create_vendor(session: AsyncSession, *, name: str | None = None) -> tuple[User, Vendor]:
    suffix = uuid.uuid4().hex[:10]
    user = User(
        username=f"vendor-{suffix}",
        email=f"vendor-{suffix}@example.com",
        first_name="Test",
        last_name="Vendor",
        role="vendor",
        is_verified=True,
        password_hash=generate_passwd_hash("password"),
    )
    session.add(user)
    await session.flush()
    vendor = Vendor(
        user_id=user.uid,
        store_name=name or f"Store {suffix}",
        slug=f"store-{suffix}",
        status="approved",
    )
    session.add(vendor)
    await session.commit()
    await session.refresh(vendor)
    return user, vendor


async def create_product(
    session: AsyncSession,
    vendor: Vendor,
    *,
    title: str = "Test product",
    price: str = "10.00",
    stock: int = 10,
    product_status: str = "active",
) -> Product:
    suffix = uuid.uuid4().hex[:10]
    product = Product(
        vendor_id=vendor.uid,
        title=title,
        slug=f"product-{suffix}",
        price=price,
        stock=stock,
        status=product_status,
    )
    session.add(product)
    await session.commit()
    await session.refresh(product)
    return product


async def create_address(session: AsyncSession, user: User) -> Address:
    address = Address(
        user_id=user.uid,
        name="Test Customer",
        phone="9999999999",
        line1="1 Test Street",
        city="Test City",
        state="Test State",
        pincode="123456",
        is_default=True,
    )
    session.add(address)
    await session.commit()
    await session.refresh(address)
    return address


async def fill_cart(session: AsyncSession, user: User, *items: tuple[Product, int]) -> Cart:
    cart = Cart(user_id=user.uid)
    session.add(cart)
    await session.flush()
    for product, quantity in items:
        session.add(
            CartItem(cart_id=cart.uid, product_id=product.uid, quantity=quantity)
        )
    await session.commit()
    await session.refresh(cart)
    return cart


@pytest_asyncio.fixture
async def helpers(session_factory):
    return {
        "create_customer": create_customer,
        "create_vendor": create_vendor,
        "create_product": create_product,
        "create_address": create_address,
        "fill_cart": fill_cart,
        "session_factory": session_factory,
    }
