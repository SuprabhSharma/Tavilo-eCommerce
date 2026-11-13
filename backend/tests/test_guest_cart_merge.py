import uuid
import pytest
from src.db.models import Cart, CartItem, Product, Wishlist

API_CART_MERGE = "/api/v1/cart/merge"
API_CART = "/api/v1/cart"


@pytest.mark.asyncio
async def test_guest_cart_merge_into_empty_account(client, helpers):
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product_a = await helpers["create_product"](session, vendor, price="25.00", stock=10)
        product_b = await helpers["create_product"](session, vendor, price="15.00", stock=5)
        customer = await helpers["create_customer"](session)

    guest_cart_id = str(uuid.uuid4())
    payload = {
        "guest_cart_id": guest_cart_id,
        "cart_items": [
            {"product_id": str(product_a.uid), "quantity": 2},
            {"product_id": str(product_b.uid), "quantity": 1},
        ],
        "wishlist_product_ids": [str(product_a.uid)],
    }

    res = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["cart"]["items"]) == 2
    assert float(data["cart"]["subtotal"]) == 65.00  # 25*2 + 15*1
    assert len(data["wishlist"]["items"]) == 1
    assert data["conflicts"] == []
    assert data["was_idempotent"] is False


@pytest.mark.asyncio
async def test_guest_cart_merge_accumulates_existing_quantities(client, helpers):
    """
    Guest cart: Product A (qty 2), Product B (qty 1)
    Existing auth cart: Product A (qty 1), Product C (qty 3)
    Expected merged cart: Product A (qty 3), Product B (qty 1), Product C (qty 3)
    """
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product_a = await helpers["create_product"](session, vendor, price="10.00", stock=20)
        product_b = await helpers["create_product"](session, vendor, price="20.00", stock=10)
        product_c = await helpers["create_product"](session, vendor, price="30.00", stock=10)
        customer = await helpers["create_customer"](session)
        # Auth user already has Product A (1) and Product C (3) in cart
        await helpers["fill_cart"](session, customer, (product_a, 1), (product_c, 3))

    guest_cart_id = str(uuid.uuid4())
    payload = {
        "guest_cart_id": guest_cart_id,
        "cart_items": [
            {"product_id": str(product_a.uid), "quantity": 2},
            {"product_id": str(product_b.uid), "quantity": 1},
        ],
        "wishlist_product_ids": [],
    }

    res = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    item_map = {item["product_id"]: item["quantity"] for item in data["cart"]["items"]}

    assert item_map[str(product_a.uid)] == 3  # 1 + 2
    assert item_map[str(product_b.uid)] == 1  # 1 from guest
    assert item_map[str(product_c.uid)] == 3  # 3 preserved from auth
    assert float(data["cart"]["subtotal"]) == 140.00  # 10*3 + 20*1 + 30*3
    assert data["conflicts"] == []


@pytest.mark.asyncio
async def test_guest_cart_merge_caps_quantity_to_available_stock(client, helpers):
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, price="10.00", stock=3)
        customer = await helpers["create_customer"](session)
        await helpers["fill_cart"](session, customer, (product, 2))

    guest_cart_id = str(uuid.uuid4())
    payload = {
        "guest_cart_id": guest_cart_id,
        "cart_items": [
            {"product_id": str(product.uid), "quantity": 3},  # Desired total: 2 + 3 = 5, but stock is 3
        ],
        "wishlist_product_ids": [],
    }

    res = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["cart"]["items"]) == 1
    assert data["cart"]["items"][0]["quantity"] == 3  # capped to stock of 3
    assert len(data["conflicts"]) == 1
    assert data["conflicts"][0]["reason"] == "quantity_capped"
    assert data["conflicts"][0]["applied_quantity"] == 3


@pytest.mark.asyncio
async def test_guest_cart_merge_reports_out_of_stock_products(client, helpers):
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product_oos = await helpers["create_product"](session, vendor, price="10.00", stock=0)
        product_ok = await helpers["create_product"](session, vendor, price="10.00", stock=5)
        customer = await helpers["create_customer"](session)

    guest_cart_id = str(uuid.uuid4())
    payload = {
        "guest_cart_id": guest_cart_id,
        "cart_items": [
            {"product_id": str(product_oos.uid), "quantity": 1},
            {"product_id": str(product_ok.uid), "quantity": 2},
        ],
        "wishlist_product_ids": [],
    }

    res = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["cart"]["items"]) == 1
    assert data["cart"]["items"][0]["product_id"] == str(product_ok.uid)
    assert len(data["conflicts"]) == 1
    assert data["conflicts"][0]["reason"] == "out_of_stock"
    assert data["conflicts"][0]["product_id"] == str(product_oos.uid)


@pytest.mark.asyncio
async def test_guest_cart_merge_is_idempotent(client, helpers):
    """
    Repeating the merge with the same guest_cart_id must NOT duplicate cart quantities.
    """
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, price="10.00", stock=20)
        customer = await helpers["create_customer"](session)

    guest_cart_id = str(uuid.uuid4())
    payload = {
        "guest_cart_id": guest_cart_id,
        "cart_items": [{"product_id": str(product.uid), "quantity": 2}],
        "wishlist_product_ids": [str(product.uid)],
    }

    # First merge
    res1 = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["was_idempotent"] is False
    assert data1["cart"]["items"][0]["quantity"] == 2

    # Second merge (network retry simulation)
    res2 = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["was_idempotent"] is True
    # Quantity MUST remain 2, not 4!
    assert data2["cart"]["items"][0]["quantity"] == 2
    assert len(data2["wishlist"]["items"]) == 1


@pytest.mark.asyncio
async def test_idempotent_retry_preserves_out_of_stock_conflicts(client, helpers):
    """
    If a product became out of stock during the first merge,
    subsequent idempotent retries must preserve and return the exact same conflicts.
    """
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product_ok = await helpers["create_product"](session, vendor, price="10.00", stock=5)
        product_oos = await helpers["create_product"](session, vendor, price="20.00", stock=0)
        customer = await helpers["create_customer"](session)

    guest_cart_id = str(uuid.uuid4())
    payload = {
        "guest_cart_id": guest_cart_id,
        "cart_items": [
            {"product_id": str(product_ok.uid), "quantity": 1},
            {"product_id": str(product_oos.uid), "quantity": 2},
        ],
        "wishlist_product_ids": [],
    }

    # First merge attempt
    res1 = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res1.status_code == 200
    d1 = res1.json()
    assert len(d1["cart"]["items"]) == 1
    assert len(d1["conflicts"]) == 1
    assert d1["conflicts"][0]["reason"] == "out_of_stock"
    assert d1["conflicts"][0]["product_id"] == str(product_oos.uid)

    # Second merge attempt (idempotent retry with same guest_cart_id)
    res2 = await client.post(
        API_CART_MERGE,
        headers={"X-Test-User": str(customer.uid)},
        json=payload,
    )
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["was_idempotent"] is True
    assert len(d2["cart"]["items"]) == 1
    assert d2["cart"]["items"][0]["quantity"] == 1
    assert len(d2["conflicts"]) == 1
    assert d2["conflicts"][0]["reason"] == "out_of_stock"
    assert d2["conflicts"][0]["product_id"] == str(product_oos.uid)

