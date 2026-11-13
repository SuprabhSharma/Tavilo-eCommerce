import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import CartItem, Order, Product, SubOrder
from src.orders.service import OrderService
from src.orders.schemas import CheckoutRequest


API = "/api/v1/orders"


async def _make_customer_cart(helpers, *, product, quantity=1):
    factory = helpers["session_factory"]
    async with factory() as session:
        user = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, user)
        await helpers["fill_cart"](session, user, (product, quantity))
    return user, address


async def _make_order(client, helpers, user, address, *, key=None, assert_success=True):
    headers = {"X-Test-User": str(user.uid)}
    if key:
        headers["Idempotency-Key"] = key
    response = await client.post(
        f"{API}/checkout",
        headers=headers,
        json={"address_id": str(address.uid), "payment_method": "cod"},
    )
    if assert_success:
        assert response.status_code in {200, 201}, response.text
    return response


@pytest.mark.asyncio
async def test_checkout_happy_path(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, price="12.50", stock=5, title="Blue mug"
        )
        user = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, user)
        await helpers["fill_cart"](session, user, (product, 2))

    response = await _make_order(client, helpers, user, address)
    body = response.json()
    assert response.status_code == 201
    assert Decimal(body["total"]) == Decimal("25.00")
    assert Decimal(body["sub_orders"][0]["subtotal"]) == Decimal("25.00")
    assert len(body["sub_orders"]) == 1

    async with factory() as session:
        updated = await session.get(Product, product.uid)
        assert updated.stock == 3
        assert not (await session.exec(select(CartItem))).first()


@pytest.mark.asyncio
async def test_checkout_multi_vendor_split(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor_one = await helpers["create_vendor"](session, name="One")
        _, vendor_two = await helpers["create_vendor"](session, name="Two")
        first = await helpers["create_product"](session, vendor_one, price="7.00")
        second = await helpers["create_product"](session, vendor_two, price="11.00")
        user = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, user)
        await helpers["fill_cart"](session, user, (first, 2), (second, 3))

    body = (await _make_order(client, helpers, user, address)).json()
    assert len(body["sub_orders"]) == 2
    assert sorted(Decimal(sub["subtotal"]) for sub in body["sub_orders"]) == [
        Decimal("14.00"),
        Decimal("33.00"),
    ]
    assert Decimal(body["total"]) == Decimal("47.00")


@pytest.mark.asyncio
async def test_checkout_insufficient_stock(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Only one", stock=1
        )
        user, address = await _make_customer_cart(helpers, product=product, quantity=2)

    response = await client.post(
        f"{API}/checkout",
        headers={"X-Test-User": str(user.uid)},
        json={"address_id": str(address.uid)},
    )
    assert response.status_code == 400
    assert "Only one" in response.json()["detail"]
    assert "available: 1" in response.json()["detail"]
    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 1
        assert not (await session.exec(select(Order))).first()


@pytest.mark.asyncio
async def test_checkout_inactive_product_rejected(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Draft item", product_status="draft"
        )
    user, address = await _make_customer_cart(helpers, product=product)
    response = await client.post(
        f"{API}/checkout",
        headers={"X-Test-User": str(user.uid)},
        json={"address_id": str(address.uid)},
    )
    assert response.status_code == 400
    assert "Draft item" in response.json()["detail"]


@pytest.mark.asyncio
async def test_oversell_race(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=1)
    customers = [await _make_customer_cart(helpers, product=product) for _ in range(2)]

    results = await asyncio.gather(
        *(_make_order(client, helpers, user, address, assert_success=False) for user, address in customers),
        return_exceptions=True,
    )
    successful = [result for result in results if not isinstance(result, Exception) and result.status_code == 201]
    failed = [result for result in results if not isinstance(result, Exception) and result.status_code == 400]
    assert len(successful) == 1
    assert len(failed) == 1
    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 0
        assert (await session.exec(select(func.count(Order.uid)))).one() == 1


@pytest.mark.asyncio
async def test_oversell_race_stock_five(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=5)
    customers = [await _make_customer_cart(helpers, product=product) for _ in range(20)]
    results = await asyncio.gather(
        *(_make_order(client, helpers, user, address, assert_success=False) for user, address in customers),
        return_exceptions=True,
    )
    assert sum(not isinstance(result, Exception) and result.status_code == 201 for result in results) == 5
    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 0
        assert (await session.exec(select(func.count(Order.uid)))).one() == 5


@pytest.mark.asyncio
async def test_overlapping_carts_no_deadlock(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        first = await helpers["create_product"](session, vendor, stock=40)
        second = await helpers["create_product"](session, vendor, stock=40)
    for _ in range(20):
        users = []
        for products in ((first, second), (second, first)):
            async with factory() as session:
                user = await helpers["create_customer"](session)
                address = await helpers["create_address"](session, user)
                await helpers["fill_cart"](session, user, (products[0], 1), (products[1], 1))
                users.append((user, address))
        results = await asyncio.gather(
            *(_make_order(client, helpers, user, address) for user, address in users),
            return_exceptions=True,
        )
        assert all(not isinstance(result, Exception) for result in results)


@pytest.mark.asyncio
async def test_atomic_rollback(helpers, monkeypatch):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=3)
        user = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, user)
        await helpers["fill_cart"](session, user, (product, 1))

    original_flush = AsyncSession.flush

    async def fail_flush(self, *args, **kwargs):
        raise RuntimeError("forced checkout failure")

    monkeypatch.setattr(AsyncSession, "flush", fail_flush)
    with pytest.raises(RuntimeError):
        async with factory() as session:
            await OrderService().checkout(
                user.uid, CheckoutRequest(address_id=address.uid), session
            )
    monkeypatch.setattr(AsyncSession, "flush", original_flush)
    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 3
        assert not (await session.exec(select(Order))).first()


@pytest.mark.asyncio
async def test_idempotency_key(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=2)
    user, address = await _make_customer_cart(helpers, product=product)
    first = await _make_order(client, helpers, user, address, key="same-key")
    second = await _make_order(client, helpers, user, address, key="same-key")
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["uid"] == second.json()["uid"]
    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 1
        assert (await session.exec(select(func.count(Order.uid)))).one() == 1


@pytest.mark.asyncio
async def test_idempotency_key_concurrent(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=2)
    user, address = await _make_customer_cart(helpers, product=product)
    results = await asyncio.gather(
        *(_make_order(client, helpers, user, address, key="race-key") for _ in range(2)),
    )
    assert {result.status_code for result in results} == {200, 201}
    assert len({result.json()["uid"] for result in results}) == 1
    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 1


async def _place_one_order(client, helpers, *, payment_method="cod"):
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=1)
    user, address = await _make_customer_cart(helpers, product=product)
    response = await client.post(
        f"{API}/checkout",
        headers={"X-Test-User": str(user.uid)},
        json={"address_id": str(address.uid), "payment_method": payment_method},
    )
    return user, vendor_user, product, response.json()


@pytest.mark.asyncio
async def test_cancel_restocks(client, helpers):
    user, _, product, body = await _place_one_order(client, helpers, payment_method="online_mock")
    response = await client.post(
        f"{API}/{body['uid']}/cancel", headers={"X-Test-User": str(user.uid)}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["payment_status"] == "refunded"
    async with helpers["session_factory"]() as session:
        assert (await session.get(Product, product.uid)).stock == 1
        sub = (await session.exec(select(SubOrder))).one()
        assert sub.status == "cancelled"


@pytest.mark.asyncio
async def test_cancel_twice_restocks_once(client, helpers):
    user, _, product, body = await _place_one_order(client, helpers)
    path = f"{API}/{body['uid']}/cancel"
    headers = {"X-Test-User": str(user.uid)}
    first, second = await asyncio.gather(
        client.post(path, headers=headers), client.post(path, headers=headers)
    )
    assert first.status_code == second.status_code == 200
    third = await client.post(path, headers=headers)
    assert third.status_code == 200
    async with helpers["session_factory"]() as session:
        assert (await session.get(Product, product.uid)).stock == 1


@pytest.mark.asyncio
async def test_cancel_after_vendor_confirm_allowed(client, helpers):
    user, vendor_user, product, body = await _place_one_order(client, helpers)
    sub_uid = body["sub_orders"][0]["uid"]
    confirmed = await client.patch(
        f"{API}/vendor/sub-orders/{sub_uid}/status",
        headers={"X-Test-User": str(vendor_user.uid)},
        json={"status": "confirmed"},
    )
    assert confirmed.status_code == 200
    cancelled = await client.post(
        f"{API}/{body['uid']}/cancel", headers={"X-Test-User": str(user.uid)}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    async with helpers["session_factory"]() as session:
        assert (await session.get(Product, product.uid)).stock == 1


@pytest.mark.asyncio
async def test_cancel_after_vendor_shipped_rejected(client, helpers):
    user, vendor_user, product, body = await _place_one_order(helpers=helpers, client=client)
    sub_uid = body["sub_orders"][0]["uid"]
    shipped = await client.patch(
        f"{API}/vendor/sub-orders/{sub_uid}/status",
        headers={"X-Test-User": str(vendor_user.uid)},
        json={"status": "confirmed"},
    )
    assert shipped.status_code == 200
    shipped = await client.patch(
        f"{API}/vendor/sub-orders/{sub_uid}/status",
        headers={"X-Test-User": str(vendor_user.uid)},
        json={"status": "shipped"},
    )
    assert shipped.status_code == 200
    cancelled = await client.post(
        f"{API}/{body['uid']}/cancel", headers={"X-Test-User": str(user.uid)}
    )
    assert cancelled.status_code == 400
    assert cancelled.json()["detail"] == (
        "This order can no longer be cancelled because a seller has shipped it."
    )


@pytest.mark.asyncio
async def test_cancel_vs_vendor_confirm_race(client, helpers):
    user, vendor_user, product, body = await _place_one_order(client, helpers)
    cancel = client.post(
        f"{API}/{body['uid']}/cancel", headers={"X-Test-User": str(user.uid)}
    )
    confirm = client.patch(
        f"{API}/vendor/sub-orders/{body['sub_orders'][0]['uid']}/status",
        headers={"X-Test-User": str(vendor_user.uid)},
        json={"status": "confirmed"},
    )
    cancelled, confirmed = await asyncio.gather(cancel, confirm)
    assert {cancelled.status_code, confirmed.status_code} == {200, 400}
    async with helpers["session_factory"]() as session:
        order = await session.get(Order, body["uid"])
        stock = (await session.get(Product, product.uid)).stock
        assert (order.status == "cancelled" and stock == 1) or (
            order.status == "placed" and stock == 0
        )


@pytest.mark.asyncio
async def test_cancel_other_users_order_404(client, helpers):
    _, _, _, body = await _place_one_order(client, helpers)
    factory = helpers["session_factory"]
    async with factory() as session:
        other = await helpers["create_customer"](session)
    response = await client.post(
        f"{API}/{body['uid']}/cancel", headers={"X-Test-User": str(other.uid)}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_vendor_cancel_suborder_restocks_and_refunds(client, helpers):
    user, vendor_user, product, body = await _place_one_order(
        client, helpers, payment_method="online_mock"
    )
    sub_uid = body["sub_orders"][0]["uid"]
    order_uid = body["uid"]

    # Vendor cancels suborder
    cancel_res = await client.patch(
        f"{API}/vendor/sub-orders/{sub_uid}/status",
        headers={"X-Test-User": str(vendor_user.uid)},
        json={"status": "cancelled"},
    )
    assert cancel_res.status_code == 200
    sub_out = cancel_res.json()
    assert sub_out["status"] == "cancelled"
    assert sub_out["parent_order_status"] == "cancelled"

    # Verify inventory was restocked and order was marked cancelled + refunded
    async with helpers["session_factory"]() as session:
        p = await session.get(Product, product.uid)
        assert p.stock == 1
        ord_db = await session.get(Order, order_uid)
        assert ord_db.status == "cancelled"
        assert ord_db.payment_status == "refunded"

    # Customer fetches order detail
    get_res = await client.get(
        f"{API}/{order_uid}",
        headers={"X-Test-User": str(user.uid)},
    )
    assert get_res.status_code == 200
    get_body = get_res.json()
    assert get_body["status"] == "cancelled"
    assert get_body["payment_status"] == "refunded"
    assert get_body["sub_orders"][0]["status"] == "cancelled"
    assert get_body["sub_orders"][0]["parent_order_status"] == "cancelled"
