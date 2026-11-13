import uuid
from decimal import Decimal
import pytest
from sqlmodel import select
from src.db.models import Product, SubOrder, User, Vendor
from src.auth.utils import generate_passwd_hash

API_VENDORS = "/api/v1/vendors"
API_PRODUCTS = "/api/v1/products"
API_SERVICES = "/api/v1/services"
API_ORDERS = "/api/v1/orders"


@pytest.fixture
def make_user():
    async def _maker(session, username, email, role="customer"):
        user = User(
            uid=uuid.uuid4(),
            username=username,
            email=email,
            first_name="First",
            last_name="Last",
            role=role,
            is_verified=True,
            password_hash=generate_passwd_hash("password123"),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user
    return _maker


@pytest.mark.asyncio
async def test_vendor_registration_unique_store_id(client, session_factory, make_user):
    """A registered vendor receives a unique store UUID in the database."""
    async with session_factory() as session:
        user = await make_user(session, "vendor_alice", "alice@example.com")

    resp = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(user.uid)},
        json={
            "store_name": "Alice Boutique",
            "slug": "alice-boutique",
            "description": "Handmade crafts",
            "logo_url": "https://example.com/logo.png",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert "uid" in data
    store_uid = uuid.UUID(data["uid"])
    assert data["store_name"] == "Alice Boutique"
    assert data["slug"] == "alice-boutique"
    assert data["status"] == "pending"

    # Verify directly in database
    async with session_factory() as session:
        vendor_db = await session.get(Vendor, store_uid)
        assert vendor_db is not None
        assert vendor_db.user_id == user.uid
        assert vendor_db.store_name == "Alice Boutique"


@pytest.mark.asyncio
async def test_vendor_duplicate_slug_rejected_409(client, session_factory, make_user):
    """Stores cannot take an existing slug; rejected with 409 Conflict."""
    async with session_factory() as session:
        user1 = await make_user(session, "user1", "user1@example.com")
        user2 = await make_user(session, "user2", "user2@example.com")

    # User 1 registers slug 'super-store'
    r1 = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(user1.uid)},
        json={"store_name": "Super Store 1", "slug": "super-store"},
    )
    assert r1.status_code == 201

    # User 2 tries to take 'super-store'
    r2 = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(user2.uid)},
        json={"store_name": "Super Store 2", "slug": "super-store"},
    )
    assert r2.status_code == 409
    assert r2.json()["error_code"] == "store_handle_taken"


@pytest.mark.asyncio
async def test_vendor_single_store_per_user_409(client, session_factory, make_user):
    """A user cannot apply for a second vendor store; rejected with 409 Conflict."""
    async with session_factory() as session:
        user = await make_user(session, "user_single", "single@example.com")

    r1 = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(user.uid)},
        json={"store_name": "First Store", "slug": "first-store"},
    )
    assert r1.status_code == 201

    r2 = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(user.uid)},
        json={"store_name": "Second Store", "slug": "second-store"},
    )
    assert r2.status_code == 409
    assert r2.json()["error_code"] == "vendor_already_exists"


@pytest.mark.asyncio
async def test_store_name_changeable_without_breaking_identity(client, session_factory, make_user):
    """Store name can be changed anytime, while store ID and ownership remain invariant."""
    async with session_factory() as session:
        user = await make_user(session, "vendor_dyn", "dyn@example.com")

    r_reg = await client.post(
        f"{API_VENDORS}/apply",
        headers={"X-Test-User": str(user.uid)},
        json={"store_name": "Old Brand Name", "slug": "dyn-store"},
    )
    store_id = r_reg.json()["uid"]

    # Change the store name
    r_upd = await client.patch(
        f"{API_VENDORS}/me/profile",
        headers={"X-Test-User": str(user.uid)},
        json={"store_name": "Brand New Rebranded Name"},
    )
    assert r_upd.status_code == 200
    updated_data = r_upd.json()
    assert updated_data["uid"] == store_id
    assert updated_data["store_name"] == "Brand New Rebranded Name"

    # Verify in DB that uid and user_id never changed
    async with session_factory() as session:
        vendor_db = await session.get(Vendor, uuid.UUID(store_id))
        assert vendor_db.store_name == "Brand New Rebranded Name"
        assert vendor_db.user_id == user.uid


@pytest.mark.asyncio
async def test_product_vendor_isolation_and_authorization(client, session_factory, make_user):
    """Products are strictly bound to vendor ID. Vendor B cannot edit or delete Vendor A's product."""
    async with session_factory() as session:
        user_a = await make_user(session, "user_a", "a@example.com")
        vendor_a = Vendor(uid=uuid.uuid4(), user_id=user_a.uid, store_name="Store A", slug="store-a", status="approved")
        session.add(vendor_a)
        user_a.role = "vendor"

        user_b = await make_user(session, "user_b", "b@example.com")
        vendor_b = Vendor(uid=uuid.uuid4(), user_id=user_b.uid, store_name="Store B", slug="store-b", status="approved")
        session.add(vendor_b)
        user_b.role = "vendor"
        await session.commit()

    # Vendor A creates a product
    r_prod = await client.post(
        f"{API_PRODUCTS}/vendor/me",
        headers={"X-Test-User": str(user_a.uid)},
        json={
            "title": "Vendor A Item",
            "slug": "vendor-a-item",
            "price": "50.00",
            "stock": 10,
            "image_urls": ["https://example.com/vendor-a-item.png"],
        },
    )
    assert r_prod.status_code == 201
    prod_id = r_prod.json()["uid"]

    # In DB, verify product.vendor_id is strictly vendor_a.uid
    async with session_factory() as session:
        p_db = await session.get(Product, uuid.UUID(prod_id))
        assert p_db.vendor_id == vendor_a.uid

    # Vendor B attempts to update Vendor A's product -> 401 InsufficientPermission
    r_hack_update = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{prod_id}",
        headers={"X-Test-User": str(user_b.uid)},
        json={"title": "Hacked Title"},
    )
    assert r_hack_update.status_code in (401, 403)

    # Vendor B attempts to delete Vendor A's product -> 401 InsufficientPermission
    r_hack_delete = await client.delete(
        f"{API_PRODUCTS}/vendor/me/{prod_id}",
        headers={"X-Test-User": str(user_b.uid)},
    )
    assert r_hack_delete.status_code in (401, 403)

    # Vendor A successfully updates and deletes their own product
    r_own_update = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{prod_id}",
        headers={"X-Test-User": str(user_a.uid)},
        json={"title": "Updated by Owner"},
    )
    assert r_own_update.status_code == 200
    assert r_own_update.json()["title"] == "Updated by Owner"

    r_own_delete = await client.delete(
        f"{API_PRODUCTS}/vendor/me/{prod_id}",
        headers={"X-Test-User": str(user_a.uid)},
    )
    assert r_own_delete.status_code == 204


@pytest.mark.asyncio
async def test_vendor_order_isolation(client, session_factory, helpers):
    """Orders are strictly partitioned by vendor store ID. Vendor A can only see and manage Vendor A's SubOrders."""
    async with session_factory() as session:
        user_v1, vendor1 = await helpers["create_vendor"](session, name="Store Alpha")
        user_v2, vendor2 = await helpers["create_vendor"](session, name="Store Beta")

        prod1 = await helpers["create_product"](session, vendor1, price="20.00", stock=5, title="Alpha Book")
        prod2 = await helpers["create_product"](session, vendor2, price="30.00", stock=5, title="Beta Gadget")

        customer = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, customer)
        await helpers["fill_cart"](session, customer, (prod1, 1), (prod2, 1))

    # Customer places order containing products from both vendors
    r_order = await client.post(
        f"{API_ORDERS}/checkout",
        headers={"X-Test-User": str(customer.uid)},
        json={"address_id": str(address.uid), "payment_method": "cod"},
    )
    assert r_order.status_code == 201
    order_data = r_order.json()
    assert len(order_data["sub_orders"]) == 2

    # Map suborders by vendor
    sub_v1 = next(s for s in order_data["sub_orders"] if s["vendor_id"] == str(vendor1.uid))
    sub_v2 = next(s for s in order_data["sub_orders"] if s["vendor_id"] == str(vendor2.uid))

    # Vendor 1 queries their orders
    r_v1_orders = await client.get(
        f"{API_ORDERS}/vendor",
        headers={"X-Test-User": str(user_v1.uid)},
    )
    assert r_v1_orders.status_code == 200
    v1_subs = r_v1_orders.json()
    assert all(s["vendor_id"] == str(vendor1.uid) for s in v1_subs)
    assert any(s["uid"] == sub_v1["uid"] for s in v1_subs)
    assert not any(s["uid"] == sub_v2["uid"] for s in v1_subs)

    # Vendor 1 attempts to update Vendor 2's suborder -> 404 (strictly unauthorized/not found)
    r_v1_hack = await client.patch(
        f"{API_ORDERS}/vendor/sub-orders/{sub_v2['uid']}/status",
        headers={"X-Test-User": str(user_v1.uid)},
        json={"status": "confirmed"},
    )
    assert r_v1_hack.status_code == 404

    # Vendor 1 updates their OWN suborder -> 200 OK
    r_v1_ok = await client.patch(
        f"{API_ORDERS}/vendor/sub-orders/{sub_v1['uid']}/status",
        headers={"X-Test-User": str(user_v1.uid)},
        json={"status": "confirmed"},
    )
    assert r_v1_ok.status_code == 200
    assert r_v1_ok.json()["status"] == "confirmed"

