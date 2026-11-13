import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlmodel import select

from src.addresses.schemas import AddressUpdate
from src.addresses.service import AddressService
from src.db.models import Address

API_ADDRESSES = "/api/v1/addresses"
API_ORDERS = "/api/v1/orders"


@pytest.mark.asyncio
async def test_address_crud_and_default_promotion(client: AsyncClient, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        user = await helpers["create_customer"](session, username="alice_addr")

    headers = {"X-Test-User": str(user.uid)}

    # 1. Create first address -> automatically becomes default
    res1 = await client.post(
        API_ADDRESSES,
        headers=headers,
        json={
            "name": "Alice Smith",
            "phone": "9876543210",
            "line1": "123 Main St",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "is_default": False,
        },
    )
    assert res1.status_code == 201
    addr1 = res1.json()
    assert addr1["is_default"] is True  # First address auto-defaulted

    # 2. Create second address without default
    res2 = await client.post(
        API_ADDRESSES,
        headers=headers,
        json={
            "name": "Alice Office",
            "phone": "9876543210",
            "line1": "456 Corporate Park",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400051",
            "is_default": False,
        },
    )
    assert res2.status_code == 201
    addr2 = res2.json()
    assert addr2["is_default"] is False

    # 3. Create third address with is_default=True -> unsets addr1 default
    res3 = await client.post(
        API_ADDRESSES,
        headers=headers,
        json={
            "name": "Alice Vacation Home",
            "phone": "9876543210",
            "line1": "789 Beach Road",
            "city": "Goa",
            "state": "Goa",
            "pincode": "403001",
            "is_default": True,
        },
    )
    assert res3.status_code == 201
    addr3 = res3.json()
    assert addr3["is_default"] is True

    # 4. Verify list ordering and defaults
    list_res = await client.get(API_ADDRESSES, headers=headers)
    assert list_res.status_code == 200
    addresses = list_res.json()
    assert len(addresses) == 3
    # Default address must be first
    assert addresses[0]["uid"] == addr3["uid"]
    assert addresses[0]["is_default"] is True

    # 5. Delete addr3 (current default) -> promotes remaining address to default
    del_res = await client.delete(f"{API_ADDRESSES}/{addr3['uid']}", headers=headers)
    assert del_res.status_code == 204

    list_after_del = await client.get(API_ADDRESSES, headers=headers)
    remaining = list_after_del.json()
    assert len(remaining) == 2
    # Exactly one remaining address is now default
    defaults = [a for a in remaining if a["is_default"]]
    assert len(defaults) == 1


@pytest.mark.asyncio
async def test_address_patch_can_clear_optional_line2(client: AsyncClient, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        user = await helpers["create_customer"](session, username="address_clear")

    headers = {"X-Test-User": str(user.uid)}
    created = await client.post(
        API_ADDRESSES,
        headers=headers,
        json={
            "name": "Clear Test",
            "phone": "9876543210",
            "line1": "1 Main Street",
            "line2": "Apartment 2",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
        },
    )
    assert created.status_code == 201

    updated = await client.patch(
        f"{API_ADDRESSES}/{created.json()['uid']}",
        headers=headers,
        json={"line2": None},
    )
    assert updated.status_code == 200
    assert updated.json()["line2"] is None


@pytest.mark.asyncio
async def test_address_patch_reuses_existing_authenticated_transaction(
    client: AsyncClient, helpers
):
    factory = helpers["session_factory"]
    async with factory() as session:
        user = await helpers["create_customer"](session, username="address_tx")
        address = await helpers["create_address"](session, user)
        await session.exec(select(Address).where(Address.uid == address.uid))
        service = AddressService()
        updated = await service.update(
            address.uid,
            user.uid,
            AddressUpdate(name="Updated Name"),
            session,
        )

    assert updated is not None
    assert updated.name == "Updated Name"


@pytest.mark.asyncio
async def test_address_strict_tenant_isolation(client: AsyncClient, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        user_a = await helpers["create_customer"](session, username="alice_iso")
        user_b = await helpers["create_customer"](session, username="bob_iso")

    headers_a = {"X-Test-User": str(user_a.uid)}
    headers_b = {"X-Test-User": str(user_b.uid)}

    # User A creates address
    res = await client.post(
        API_ADDRESSES,
        headers=headers_a,
        json={
            "name": "Alice Private",
            "phone": "9876543210",
            "line1": "Secret Lane 1",
            "city": "Pune",
            "state": "Maharashtra",
            "pincode": "411001",
        },
    )
    assert res.status_code == 201
    addr_a_id = res.json()["uid"]

    # User B cannot see User A's address in their list
    b_list = await client.get(API_ADDRESSES, headers=headers_b)
    assert b_list.status_code == 200
    assert len(b_list.json()) == 0

    # User B cannot update User A's address -> 404 AddressNotFound
    hack_patch = await client.patch(
        f"{API_ADDRESSES}/{addr_a_id}",
        headers=headers_b,
        json={"name": "Hacked Name"},
    )
    assert hack_patch.status_code == 404

    # User B cannot delete User A's address -> 404 AddressNotFound
    hack_del = await client.delete(f"{API_ADDRESSES}/{addr_a_id}", headers=headers_b)
    assert hack_del.status_code == 404


@pytest.mark.asyncio
async def test_multi_vendor_checkout_with_address_snapshot(client: AsyncClient, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        customer = await helpers["create_customer"](session)
        _, vendor_1 = await helpers["create_vendor"](session, name="Alpha Store")
        prod_1 = await helpers["create_product"](session, vendor_1, price="50.00", stock=20)
        _, vendor_2 = await helpers["create_vendor"](session, name="Beta Store")
        prod_2 = await helpers["create_product"](session, vendor_2, price="75.00", stock=20)

    headers = {"X-Test-User": str(customer.uid)}

    # Create delivery address
    addr_res = await client.post(
        API_ADDRESSES,
        headers=headers,
        json={
            "name": "John Doe",
            "phone": "9123456780",
            "line1": "Flat 402, Highrise Tower",
            "line2": "MG Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
        },
    )
    assert addr_res.status_code == 201
    addr_id = addr_res.json()["uid"]

    # Customer adds items to cart
    async with factory() as session:
        await helpers["fill_cart"](session, customer, (prod_1, 2), (prod_2, 1))

    # Checkout with valid address
    checkout_res = await client.post(
        f"{API_ORDERS}/checkout",
        headers=headers,
        json={
            "address_id": addr_id,
            "payment_method": "cod",
        },
    )
    assert checkout_res.status_code == 201
    order_data = checkout_res.json()

    # Verify order total: (50 * 2) + (75 * 1) = 175.00
    assert Decimal(str(order_data["total"])) == Decimal("175.00")

    # Verify address snapshot is captured permanently
    snapshot = order_data["address_snapshot"]
    assert snapshot["name"] == "John Doe"
    assert snapshot["city"] == "Bengaluru"
    assert snapshot["pincode"] == "560001"

    # Multi-vendor: 2 sub-orders created, one for each vendor
    assert len(order_data["sub_orders"]) == 2
    vendor_ids = {s["vendor_id"] for s in order_data["sub_orders"]}
    assert str(vendor_1.uid) in vendor_ids
    assert str(vendor_2.uid) in vendor_ids


@pytest.mark.asyncio
async def test_checkout_fails_with_invalid_or_foreign_address(client: AsyncClient, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        customer_1 = await helpers["create_customer"](session)
        customer_2 = await helpers["create_customer"](session)
        _, vendor = await helpers["create_vendor"](session, name="Gamma Store")
        prod = await helpers["create_product"](session, vendor, price="30.00", stock=15)

    headers_1 = {"X-Test-User": str(customer_1.uid)}
    headers_2 = {"X-Test-User": str(customer_2.uid)}

    # Customer 2 creates an address
    addr_res = await client.post(
        API_ADDRESSES,
        headers=headers_2,
        json={
            "name": "Foreign Address",
            "phone": "9999999999",
            "line1": "Road 9",
            "city": "Delhi",
            "state": "Delhi",
            "pincode": "110001",
        },
    )
    c2_addr_id = addr_res.json()["uid"]

    # Customer 1 has item in cart
    async with factory() as session:
        await helpers["fill_cart"](session, customer_1, (prod, 1))

    # Customer 1 attempts checkout with Customer 2's address -> 400 Bad Request
    fail_res = await client.post(
        f"{API_ORDERS}/checkout",
        headers=headers_1,
        json={
            "address_id": c2_addr_id,
            "payment_method": "cod",
        },
    )
    assert fail_res.status_code == 400
    assert "Address not found" in fail_res.json()["detail"]

    # Customer 1 attempts checkout with non-existent random UUID -> 400 Bad Request
    fail_res2 = await client.post(
        f"{API_ORDERS}/checkout",
        headers=headers_1,
        json={
            "address_id": str(uuid.uuid4()),
            "payment_method": "cod",
        },
    )
    assert fail_res2.status_code == 400
    assert "Address not found" in fail_res2.json()["detail"]
