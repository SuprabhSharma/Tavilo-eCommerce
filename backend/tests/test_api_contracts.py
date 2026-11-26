import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from src import app
from src.auth.dependencies import AccessTokenBearer
from src.auth.utils import create_access_tokens
from src.cart.schemas import CartItemAdd, CartItemUpdate
from src.errors import AccessTokenRequired
from src.orders.schemas import CheckoutRequest, OrderItemOut
from src.products.schemas import ProductCreate, ProductUpdate, calculate_discount_percent
from src.products.service import ProductService


pytestmark = pytest.mark.no_db


@pytest.mark.asyncio
async def test_health_endpoint_exposes_stable_service_contract():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "v1"}


def test_product_create_normalizes_fields_and_computes_discount():
    payload = ProductCreate(
        title="  Linen shirt  ",
        slug="  linen-shirt  ",
        price=Decimal("80"),
        mrp=Decimal("100"),
        stock=4,
        sku="  LS-001  ",
        image_urls=["/api/v1/products/images/linen.webp"],
    )

    assert payload.title == "Linen shirt"
    assert payload.slug == "linen-shirt"
    assert payload.sku == "LS-001"
    assert calculate_discount_percent(payload.price, payload.mrp) == Decimal("20.00")


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "Product", "slug": "product", "price": "100", "mrp": "99", "stock": 1, "image_urls": ["image.webp"]},
        {"title": "Product", "slug": "product", "price": "100", "mrp": "100", "stock": 1, "image_urls": []},
    ],
)
def test_product_create_rejects_invalid_price_or_missing_image(payload):
    with pytest.raises(ValidationError):
        ProductCreate(**payload)


def test_product_reads_hide_missing_local_media_without_dropping_database_records(tmp_path, monkeypatch):
    from types import SimpleNamespace

    import src.products.image_storage as image_storage

    monkeypatch.setattr(image_storage, "PRODUCT_IMAGE_DIR", tmp_path)
    existing = tmp_path / "existing.webp"
    existing.write_bytes(b"webp")
    product = SimpleNamespace(
        images=[
            SimpleNamespace(url="/api/v1/products/images/existing.webp"),
            SimpleNamespace(url="/api/v1/products/images/missing.webp"),
            SimpleNamespace(url="https://cdn.example.com/product.webp"),
        ]
    )

    response_product = ProductService._with_available_images(product)

    assert [image.url for image in response_product.images] == [
        "/api/v1/products/images/existing.webp",
        "https://cdn.example.com/product.webp",
    ]
    assert len(product.images) == 3


def test_product_update_validates_price_pair_when_both_values_are_supplied():
    with pytest.raises(ValidationError, match="MRP must be greater"):
        ProductUpdate(price=Decimal("100"), mrp=Decimal("99"))

    update = ProductUpdate(stock=0, sku="  ")
    assert update.stock == 0
    assert update.sku is None


def test_cart_quantity_contract_rejects_non_positive_values():
    with pytest.raises(ValidationError):
        CartItemAdd(product_id=uuid.uuid4(), quantity=0)
    with pytest.raises(ValidationError):
        CartItemUpdate(quantity=0)


def test_order_item_derives_line_total_from_snapshot_price():
    item = OrderItemOut(
        uid=uuid.uuid4(),
        product_id=uuid.uuid4(),
        title_snapshot="Notebook",
        price_snapshot=Decimal("12.50"),
        quantity=3,
    )

    assert item.line_total == Decimal("37.50")


def test_access_token_bearer_rejects_refresh_tokens_and_invalid_claim_types():
    bearer = AccessTokenBearer()
    access_payload = {
        "email": "customer@example.com",
        "user_uid": str(uuid.uuid4()),
        "role": "customer",
        "session_version": 0,
    }
    access_token = create_access_tokens(access_payload)
    refresh_token = create_access_tokens(access_payload, refresh=True)

    from src.auth.utils import decode_token

    access_data = decode_token(access_token)
    refresh_data = decode_token(refresh_token)
    assert bearer.token_valid(access_data)
    assert not bearer.token_valid({**access_data, "sv": True})

    with pytest.raises(AccessTokenRequired):
        bearer.verify_token_data(refresh_data)


def test_checkout_schema_preserves_supported_payment_method_values():
    address_id = uuid.uuid4()
    assert CheckoutRequest(address_id=address_id, payment_method="cod").payment_method == "cod"
    assert (
        CheckoutRequest(address_id=address_id, payment_method="online_mock").payment_method
        == "online_mock"
    )
    with pytest.raises(ValidationError):
        CheckoutRequest(address_id=address_id, payment_method="invalid_method")


def test_checkout_schema_with_direct_item():
    address_id = uuid.uuid4()
    product_id = uuid.uuid4()
    req = CheckoutRequest(
        address_id=address_id,
        payment_method="cod",
        direct_item={"product_id": product_id, "quantity": 3},
    )
    assert req.direct_item is not None
    assert req.direct_item.product_id == product_id
    assert req.direct_item.quantity == 3
    with pytest.raises(ValidationError):
        CheckoutRequest(
            address_id=address_id,
            payment_method="cod",
            direct_item={"product_id": product_id, "quantity": 0},
        )


def test_api_routes_include_protected_vendor_admin_and_order_operations():
    paths = app.openapi()["paths"]

    assert "get" in paths["/api/v1/products"]
    assert "post" in paths["/api/v1/vendors/apply"]
    assert "get" in paths["/api/v1/vendors/admin/pending/page"]
    assert "patch" in paths["/api/v1/vendors/admin/{uid}/approve"]
    assert "post" in paths["/api/v1/orders/checkout"]
    assert "patch" in paths["/api/v1/products/vendor/me/{uid}"]
