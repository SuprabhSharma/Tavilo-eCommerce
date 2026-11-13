import asyncio

import pytest
from src.db.models import Product


API_ORDERS = "/api/v1/orders"


@pytest.mark.asyncio
async def test_concurrent_checkout_reuses_idempotent_order(client, helpers):
    async with helpers["session_factory"]() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, stock=3)
        customer = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, customer)
        await helpers["fill_cart"](session, customer, (product, 1))

    async def checkout_once():
        return await client.post(
            f"{API_ORDERS}/checkout",
            headers={
                "X-Test-User": str(customer.uid),
                "Idempotency-Key": "concurrent-checkout",
            },
            json={"address_id": str(address.uid), "payment_method": "cod"},
        )

    responses = await asyncio.gather(*(checkout_once() for _ in range(5)))
    assert sorted(response.status_code for response in responses) == [
        200,
        200,
        200,
        200,
        201,
    ]
    assert len({response.json()["uid"] for response in responses}) == 1

    async with helpers["session_factory"]() as session:
        saved_product = await session.get(Product, product.uid)
        assert saved_product.stock == 2
