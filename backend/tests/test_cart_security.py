import uuid
import pytest

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
