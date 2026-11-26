import asyncio
import time
import uuid

import pytest
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from src.db.models import Order, OrderItem, Product


API_CART = "/api/v1/cart"
API_ORDERS = "/api/v1/orders"


@pytest.mark.asyncio
async def test_cannot_add_or_order_nonexistent_inactive_or_suspended_product(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        draft_p = await helpers["create_product"](
            session, vendor, title="Draft Item", stock=5, product_status="draft"
        )
        archived_p = await helpers["create_product"](
            session, vendor, title="Archived Item", stock=5, product_status="archived"
        )
        susp_user, susp_vendor = await helpers["create_vendor"](session, name="Susp Store")
        susp_p = await helpers["create_product"](
            session, susp_vendor, title="Suspended Seller Item", stock=5
        )
        susp_user.role = "customer"
        susp_vendor.status = "suspended"
        session.add(susp_user)
        session.add(susp_vendor)
        await session.commit()

        buyer = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, buyer)

    headers = {"X-Test-User": str(buyer.uid)}
    fake_id = str(uuid.uuid4())

    # Fake product ID rejected in cart and direct Buy Now checkout
    cart_fake = await client.post(
        API_CART, headers=headers, json={"product_id": fake_id, "quantity": 1}
    )
    assert cart_fake.status_code == 404

    buy_fake = await client.post(
        f"{API_ORDERS}/checkout",
        headers=headers,
        json={
            "address_id": str(address.uid),
            "payment_method": "cod",
            "direct_item": {"product_id": fake_id, "quantity": 1},
        },
    )
    assert buy_fake.status_code == 400
    assert "unavailable" in buy_fake.json()["detail"].lower()

    # Draft, archived, and suspended-vendor products rejected on Direct Buy Now
    for bad_product in (draft_p, archived_p, susp_p):
        r_cart = await client.post(
            API_CART,
            headers=headers,
            json={"product_id": str(bad_product.uid), "quantity": 1},
        )
        assert r_cart.status_code == 404

        r_buy = await client.post(
            f"{API_ORDERS}/checkout",
            headers=headers,
            json={
                "address_id": str(address.uid),
                "payment_method": "online_mock",
                "direct_item": {"product_id": str(bad_product.uid), "quantity": 1},
            },
        )
        assert r_buy.status_code == 400
        assert "unavailable" in r_buy.json()["detail"].lower()

    async with factory() as session:
        assert (await session.exec(select(func.count(Order.uid)))).one() == 0


@pytest.mark.asyncio
async def test_cannot_order_more_than_real_db_stock(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Limited Watch", stock=2
        )
        buyer = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, buyer)

    headers = {"X-Test-User": str(buyer.uid)}

    # Cannot add 3 when DB stock is 2
    assert (
        await client.post(
            API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 3}
        )
    ).status_code == 400

    # Add 2 -> ok, then adding 1 more -> 400, patching to 3 -> 400
    add2 = await client.post(
        API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 2}
    )
    assert add2.status_code == 200
    item_uid = add2.json()["items"][0]["uid"]

    assert (
        await client.post(
            API_CART, headers=headers, json={"product_id": str(product.uid), "quantity": 1}
        )
    ).status_code == 400
    assert (
        await client.patch(
            f"{API_CART}/{item_uid}", headers=headers, json={"quantity": 3}
        )
    ).status_code == 400

    # Cannot direct Buy Now qty=3 when DB stock is 2; qty=0 rejected at schema
    over_buy = await client.post(
        f"{API_ORDERS}/checkout",
        headers=headers,
        json={
            "address_id": str(address.uid),
            "payment_method": "cod",
            "direct_item": {"product_id": str(product.uid), "quantity": 3},
        },
    )
    assert over_buy.status_code == 400
    assert "insufficient stock" in over_buy.json()["detail"].lower()

    zero_buy = await client.post(
        f"{API_ORDERS}/checkout",
        headers=headers,
        json={
            "address_id": str(address.uid),
            "payment_method": "cod",
            "direct_item": {"product_id": str(product.uid), "quantity": 0},
        },
    )
    assert zero_buy.status_code == 422

    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 2
        assert (await session.exec(select(func.count(Order.uid)))).one() == 0


@pytest.mark.asyncio
async def test_flipkart_flash_sale_last_one_unit_direct_buy_25_concurrent_buyers(
    client, helpers
):
    """Worst case: 1 unit left in DB, 25 customers click Buy Now at the exact same instant."""
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Last Phone", price="999.00", stock=1
        )
        buyers = []
        for _ in range(25):
            u = await helpers["create_customer"](session)
            a = await helpers["create_address"](session, u)
            buyers.append((u, a))

    async def click_buy_now(user, addr):
        return await client.post(
            f"{API_ORDERS}/checkout",
            headers={"X-Test-User": str(user.uid)},
            json={
                "address_id": str(addr.uid),
                "payment_method": "online_mock",
                "direct_item": {"product_id": str(product.uid), "quantity": 1},
            },
        )

    t0 = time.perf_counter()
    results = await asyncio.gather(
        *(click_buy_now(u, a) for u, a in buyers),
        return_exceptions=True,
    )
    elapsed = time.perf_counter() - t0

    assert all(not isinstance(r, Exception) for r in results), [
        r for r in results if isinstance(r, Exception)
    ]
    statuses = [r.status_code for r in results]
    assert statuses.count(201) == 1, statuses
    assert statuses.count(400) == 24, statuses
    assert elapsed < 15.0

    async with factory() as session:
        saved = await session.get(Product, product.uid)
        assert saved.stock == 0
        assert (await session.exec(select(func.count(Order.uid)))).one() == 1
        assert (
            await session.exec(select(func.coalesce(func.sum(OrderItem.quantity), 0)))
        ).one() == 1


@pytest.mark.asyncio
async def test_flipkart_cart_checkout_last_one_unit_25_concurrent_buyers(
    client, helpers
):
    """Worst case: 25 customers already have the last 1 unit in cart and check out simultaneously."""
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Last Headphone", price="499.00", stock=1
        )
        buyers = []
        for _ in range(25):
            u = await helpers["create_customer"](session)
            a = await helpers["create_address"](session, u)
            await helpers["fill_cart"](session, u, (product, 1))
            buyers.append((u, a))

    results = await asyncio.gather(
        *(
            client.post(
                f"{API_ORDERS}/checkout",
                headers={"X-Test-User": str(u.uid)},
                json={"address_id": str(a.uid), "payment_method": "cod"},
            )
            for u, a in buyers
        ),
        return_exceptions=True,
    )

    assert all(not isinstance(r, Exception) for r in results)
    statuses = [r.status_code for r in results]
    assert statuses.count(201) == 1
    assert statuses.count(400) == 24

    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 0
        assert (await session.exec(select(func.count(Order.uid)))).one() == 1


@pytest.mark.asyncio
async def test_partial_stock_multi_qty_never_oversells_or_goes_negative(client, helpers):
    """Stock = 3, 20 customers each attempt to buy quantity = 2 -> only 1 succeeds, stock = 1."""
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Limited Shoes", price="150.00", stock=3
        )
        buyers = []
        for _ in range(20):
            u = await helpers["create_customer"](session)
            a = await helpers["create_address"](session, u)
            buyers.append((u, a))

    results = await asyncio.gather(
        *(
            client.post(
                f"{API_ORDERS}/checkout",
                headers={"X-Test-User": str(u.uid)},
                json={
                    "address_id": str(a.uid),
                    "payment_method": "cod",
                    "direct_item": {"product_id": str(product.uid), "quantity": 2},
                },
            )
            for u, a in buyers
        ),
        return_exceptions=True,
    )

    assert all(not isinstance(r, Exception) for r in results)
    statuses = [r.status_code for r in results]
    assert statuses.count(201) == 1
    assert statuses.count(400) == 19

    async with factory() as session:
        assert (await session.get(Product, product.uid)).stock == 1
        assert (await session.exec(select(func.count(Order.uid)))).one() == 1
        assert (
            await session.exec(select(func.coalesce(func.sum(OrderItem.quantity), 0)))
        ).one() == 2

        # DB-level CHECK constraint guarantees stock can never become negative
        with pytest.raises(IntegrityError):
            await session.exec(
                text("UPDATE products SET stock = -1 WHERE uid = :pid").params(
                    pid=product.uid
                )
            )
            await session.commit()
        await session.rollback()
