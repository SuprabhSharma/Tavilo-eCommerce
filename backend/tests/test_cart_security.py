import asyncio
import uuid
import pytest
from src.db.models import Product, User, Vendor

API_CART = "/api/v1/cart"
API_CART_MERGE = "/api/v1/cart/merge"
API_ORDERS = "/api/v1/orders"
API_WISHLIST = "/api/v1/wishlist"


@pytest.mark.asyncio
async def test_guest_cannot_access_authenticated_cart(client):
    # Without X-Test-User / Authorization header, should fail
    with pytest.raises(AssertionError, match="X-Test-User header is required"):
        await client.get(API_CART)


@pytest.mark.asyncio
async def test_guest_cannot_access_authenticated_wishlist(client):
    with pytest.raises(AssertionError, match="X-Test-User header is required"):
        await client.get(API_WISHLIST)


@pytest.mark.asyncio
async def test_guest_cannot_checkout(client):
    with pytest.raises(AssertionError, match="X-Test-User header is required"):
        await client.post(
            f"{API_ORDERS}/checkout",
            json={"address_id": str(uuid.uuid4()), "payment_method": "cod"},
        )


@pytest.mark.asyncio
async def test_guest_cannot_view_orders(client):
    with pytest.raises(AssertionError, match="X-Test-User header is required"):
        await client.get(API_ORDERS)


@pytest.mark.asyncio
async def test_user_cannot_access_another_users_cart(client, helpers):
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, price="10.00", stock=10)
        user_a = await helpers["create_customer"](session)
        user_b = await helpers["create_customer"](session)
        await helpers["fill_cart"](session, user_a, (product, 2))

    # User B requests their cart — must NOT see User A's items
    res_b = await client.get(
        API_CART,
        headers={"X-Test-User": str(user_b.uid)},
    )
    assert res_b.status_code == 200
    assert len(res_b.json()["items"]) == 0

    # User A requests their cart — sees their items
    res_a = await client.get(
        API_CART,
        headers={"X-Test-User": str(user_a.uid)},
    )
    assert res_a.status_code == 200
    assert len(res_a.json()["items"]) == 1
    assert res_a.json()["items"][0]["quantity"] == 2


@pytest.mark.asyncio
async def test_cart_enforces_max_order_qty_zero_stock_and_vendor_status(client, helpers):
    async with helpers["session_factory"]() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, price="10.00", stock=10)
        product.max_order_qty = 3
        oos_product = await helpers["create_product"](session, vendor, price="10.00", stock=0)
        session.add(product)
        await session.commit()
        user = await helpers["create_customer"](session)

    headers = {"X-Test-User": str(user.uid)}

    # Adding 0-stock product gives clean out-of-stock message
    oos_res = await client.post(
        API_CART, headers=headers, json={"product_id": str(oos_product.uid), "quantity": 1}
    )
    assert oos_res.status_code == 400
    assert "out of stock" in oos_res.json()["detail"].lower()

    # Adding above max_order_qty rejected
    over_res = await client.post(
        API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 4}
    )
    assert over_res.status_code == 400
    assert "maximum of 3" in over_res.json()["detail"].lower()

    # Add 2, then update to 3 (hits cap), then reject 4
    add_res = await client.post(
        API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 2}
    )
    assert add_res.status_code == 200
    item_uid = add_res.json()["items"][0]["uid"]
    assert add_res.json()["items"][0]["max_qty"] == 3
    assert add_res.json()["items"][0]["at_limit"] is False

    patch_ok = await client.patch(f"{API_CART}/{item_uid}", headers=headers, json={"quantity": 3})
    assert patch_ok.status_code == 200
    assert patch_ok.json()["items"][0]["at_limit"] is True

    patch_over = await client.patch(f"{API_CART}/{item_uid}", headers=headers, json={"quantity": 4})
    assert patch_over.status_code == 400

    # If vendor is suspended after item is in cart, GET /cart marks product unavailable
    async with helpers["session_factory"]() as session:
        v_user = await session.get(User, vendor_user.uid)
        v_user.role = "customer"
        v = await session.get(Vendor, vendor.uid)
        v.status = "suspended"
        session.add(v_user)
        session.add(v)
        await session.commit()

    cart_after_suspend = await client.get(API_CART, headers=headers)
    assert cart_after_suspend.status_code == 200
    item_after = cart_after_suspend.json()["items"][0]
    assert item_after["product"]["is_available"] is False
    assert item_after["max_qty"] == 0


@pytest.mark.asyncio
async def test_concurrent_cart_add_and_update_no_race_or_deadlock(client, helpers):
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, price="10.00", stock=3)
        user = await helpers["create_customer"](session)

    headers = {"X-Test-User": str(user.uid)}

    # 6 concurrent adds of qty=1 when cart doesn't exist yet and stock=3
    add_results = await asyncio.gather(
        *(
            client.post(
                API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 1}
            )
            for _ in range(6)
        )
    )
    assert all(r.status_code in {200, 400} for r in add_results)
    assert sum(r.status_code == 200 for r in add_results) == 3

    cart_res = await client.get(API_CART, headers=headers)
    assert cart_res.status_code == 200
    item = cart_res.json()["items"][0]
    assert item["quantity"] == 3

    # Concurrent PATCH updates & POST adds do not deadlock or exceed cap
    mix_results = await asyncio.gather(
        client.patch(f"{API_CART}/{item['uid']}", headers=headers, json={"quantity": 2}),
        client.post(API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 1}),
        client.patch(f"{API_CART}/{item['uid']}", headers=headers, json={"quantity": 1}),
    )
    assert all(r.status_code in {200, 400} for r in mix_results)
    final_cart = await client.get(API_CART, headers=headers)
    assert 1 <= final_cart.json()["items"][0]["quantity"] <= 3
