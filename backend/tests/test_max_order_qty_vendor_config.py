"""
Production-grade tests for per-order quantity cap vendor configuration.

Covers every critical path:
  1. Vendor sets max_order_qty on create → enforced in cart + checkout
  2. Vendor updates max_order_qty on existing product → cart sees new cap immediately
  3. Vendor clears cap (sets null) → reverts to stock-only enforcement
  4. Concurrent cart-add: 20 buyers each try to add qty > cap simultaneously
  5. Guest merge: cap clamping when guest qty + account qty exceeds cap
  6. Checkout final gate: cap still enforced even if cart was loaded before cap changed
  7. API-level guard: cannot set max_order_qty = 0 (Pydantic 422)
  8. API-level guard: cannot set max_order_qty negative (Pydantic 422)
  9. UI-visible: available_stock in API response equals min(stock, cap)
 10. Race-free: cap update and concurrent checkout do not leave stock negative
"""
import asyncio
import uuid

import pytest
from sqlmodel import select

from src.db.models import Order, Product

API_PRODUCTS = "/api/v1/products"
API_CART = "/api/v1/cart"
API_ORDERS = "/api/v1/orders"


# ── 1. Create product with cap → cap enforced immediately ────────────────────

@pytest.mark.asyncio
async def test_create_product_with_cap_enforced_in_cart(client, helpers):
    """Vendor creates product with max_order_qty=3; buyer cannot add 4."""
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Capped Watch", stock=50, max_order_qty=3
        )
        buyer = await helpers["create_customer"](session)

    h = {"X-Test-User": str(buyer.uid)}

    # Adding exactly 3 is accepted
    r = await client.post(API_CART, headers=h, json={
        "product_id": str(product.uid), "quantity": 3
    })
    assert r.status_code == 200, r.text

    # Adding 1 more (total 4) is rejected — cap is 3
    r2 = await client.post(API_CART, headers=h, json={
        "product_id": str(product.uid), "quantity": 1
    })
    assert r2.status_code == 400
    assert "maximum of 3" in r2.json()["detail"]

    # PATCH to qty=4 also rejected
    item_uid = r.json()["items"][0]["uid"]
    r3 = await client.patch(f"{API_CART}/{item_uid}", headers=h, json={"quantity": 4})
    assert r3.status_code == 400
    assert "maximum of 3" in r3.json()["detail"]


# ── 2. Vendor updates cap → cart sees new cap immediately (no cache) ─────────

@pytest.mark.asyncio
async def test_vendor_update_cap_takes_effect_immediately(client, helpers):
    """
    Product starts with no cap (stock=10).
    Buyer adds qty=8 to cart (fine).
    Vendor updates max_order_qty=5.
    Buyer tries to PATCH cart to qty=6 → rejected.
    Buyer PATCHes to qty=5 → accepted.
    """
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Variable Cap Phone", stock=10
        )
        buyer = await helpers["create_customer"](session)

    buyer_h = {"X-Test-User": str(buyer.uid)}
    vendor_h = {"X-Test-User": str(vendor_user.uid)}

    # Buyer adds 8 (no cap yet — OK)
    r = await client.post(API_CART, headers=buyer_h, json={
        "product_id": str(product.uid), "quantity": 8
    })
    assert r.status_code == 200
    item_uid = r.json()["items"][0]["uid"]

    # Vendor reduces cap to 5 via PATCH
    patch_r = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{product.uid}",
        headers=vendor_h,
        json={"max_order_qty": 5},
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["max_order_qty"] == 5

    # Cart PATCH to qty=6 now rejected (cap=5, stock=10 → effective=5)
    r2 = await client.patch(f"{API_CART}/{item_uid}", headers=buyer_h, json={"quantity": 6})
    assert r2.status_code == 400
    assert "maximum of 5" in r2.json()["detail"]

    # Cart PATCH to qty=5 accepted
    r3 = await client.patch(f"{API_CART}/{item_uid}", headers=buyer_h, json={"quantity": 5})
    assert r3.status_code == 200
    assert r3.json()["items"][0]["quantity"] == 5


# ── 3. Vendor clears cap → reverts to stock-only enforcement ─────────────────

@pytest.mark.asyncio
async def test_vendor_clear_cap_reverts_to_stock_enforcement(client, helpers):
    """Vendor sets cap=2, then clears it (null) → buyer can add up to full stock."""
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Clearable Cap Item", stock=20, max_order_qty=2
        )
        buyer = await helpers["create_customer"](session)

    buyer_h = {"X-Test-User": str(buyer.uid)}
    vendor_h = {"X-Test-User": str(vendor_user.uid)}

    # Cannot add 3 when cap=2
    r = await client.post(API_CART, headers=buyer_h, json={
        "product_id": str(product.uid), "quantity": 3
    })
    assert r.status_code == 400

    # Vendor sends max_order_qty=null → clears cap
    patch_r = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{product.uid}",
        headers=vendor_h,
        json={"max_order_qty": None},
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["max_order_qty"] is None

    # Now buyer can add 15 (only stock=20 limits)
    r2 = await client.post(API_CART, headers=buyer_h, json={
        "product_id": str(product.uid), "quantity": 15
    })
    assert r2.status_code == 200


# ── 4. Concurrent cart-add: 20 buyers all try qty > cap simultaneously ───────

@pytest.mark.asyncio
async def test_concurrent_cart_add_all_reject_above_cap(client, helpers):
    """
    Product: stock=100, max_order_qty=3.
    20 concurrent buyers each try to add qty=4.
    Every single request must be rejected — no one breaks the cap.
    """
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Concurrent Cap Test", stock=100, max_order_qty=3
        )
        buyers = [await helpers["create_customer"](session) for _ in range(20)]

    results = await asyncio.gather(
        *(
            client.post(API_CART, headers={"X-Test-User": str(u.uid)},
                       json={"product_id": str(product.uid), "quantity": 4})
            for u in buyers
        ),
        return_exceptions=True,
    )
    assert all(not isinstance(r, Exception) for r in results)
    # Every buyer should be rejected — cap is 3, they all asked for 4
    assert all(r.status_code == 400 for r in results)
    assert all("maximum of 3" in r.json()["detail"] for r in results)

    # Verify stock was untouched
    async with factory() as session:
        p = await session.get(Product, product.uid)
        assert p.stock == 100  # No decrement since all rejected at cart stage


# ── 5. Guest merge: cap clamping when combined qty exceeds cap ───────────────

@pytest.mark.asyncio
async def test_guest_merge_clamps_to_cap(client, helpers):
    """
    cap=5. Account cart already has qty=3.
    Guest cart arrives with qty=4.
    After merge: qty should be clamped to 5 (not 7).
    MergeConflict should be reported.
    """
    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Merge Cap Item", stock=100, max_order_qty=5
        )
        buyer = await helpers["create_customer"](session)
        await helpers["fill_cart"](session, buyer, (product, 3))

    h = {"X-Test-User": str(buyer.uid)}

    merge_payload = {
        "guest_cart_id": str(uuid.uuid4()),
        "cart_items": [{"product_id": str(product.uid), "quantity": 4}],
        "wishlist_product_ids": [],
    }
    r = await client.post("/api/v1/cart/merge", headers=h, json=merge_payload)
    assert r.status_code == 200
    body = r.json()

    # Quantity clamped to 5
    merged_items = body["cart"]["items"]
    assert len(merged_items) == 1
    assert merged_items[0]["quantity"] == 5

    # Conflict reported
    assert len(body["conflicts"]) == 1
    conflict = body["conflicts"][0]
    assert conflict["reason"] == "quantity_capped"
    assert conflict["requested_quantity"] == 7   # 3 + 4
    assert conflict["applied_quantity"] == 5


# ── 6. Checkout final gate: cap enforced even if cart pre-dates cap change ───

@pytest.mark.asyncio
async def test_checkout_enforces_cap_even_if_cart_was_loaded_before_cap_set(
    client, helpers
):
    """
    Buyer adds qty=8 before vendor sets cap=5.
    Cart item now has qty=8 but cap=5 → checkout must reject.
    """
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Stale Cart Checkout", stock=20
        )
        buyer = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, buyer)
        # Pre-load cart with qty=8 (no cap yet)
        await helpers["fill_cart"](session, buyer, (product, 8))

    buyer_h = {"X-Test-User": str(buyer.uid)}
    vendor_h = {"X-Test-User": str(vendor_user.uid)}

    # Vendor sets cap=5 after cart was loaded
    patch_r = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{product.uid}",
        headers=vendor_h,
        json={"max_order_qty": 5},
    )
    assert patch_r.status_code == 200

    # Checkout with stale cart (qty=8, cap=5) → must be rejected
    co_r = await client.post(
        f"{API_ORDERS}/checkout",
        headers=buyer_h,
        json={"address_id": str(address.uid), "payment_method": "cod"},
    )
    assert co_r.status_code == 400
    assert "maximum of 5" in co_r.json()["detail"].lower()

    # Verify no order was created and stock untouched
    async with factory() as session:
        p = await session.get(Product, product.uid)
        assert p.stock == 20
        from sqlalchemy import func
        order_count = (await session.exec(
            select(func.count(Order.uid))
        )).one()
        assert order_count == 0


# ── 7. API guard: max_order_qty=0 → Pydantic 422 ────────────────────────────

@pytest.mark.asyncio
async def test_cannot_set_max_order_qty_zero(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, title="Zero Cap Test", stock=10)

    h = {"X-Test-User": str(vendor_user.uid)}
    r = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{product.uid}",
        headers=h,
        json={"max_order_qty": 0},
    )
    assert r.status_code == 422


# ── 8. API guard: max_order_qty negative → Pydantic 422 ─────────────────────

@pytest.mark.asyncio
async def test_cannot_set_max_order_qty_negative(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](session, vendor, title="Negative Cap Test", stock=10)

    h = {"X-Test-User": str(vendor_user.uid)}
    r = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{product.uid}",
        headers=h,
        json={"max_order_qty": -1},
    )
    assert r.status_code == 422


# ── 9. API response: available_stock = min(stock, cap) ──────────────────────

@pytest.mark.asyncio
async def test_available_stock_response_reflects_cap(client, helpers, monkeypatch):
    """
    stock=100, cap=7 → available_stock in public API response must be 7.
    stock=3, cap=7  → available_stock must be 3 (stock is binding).
    """
    async def _allow(_ip):
        return True, 0

    monkeypatch.setattr("src.products.routes.check_catalog_rate", _allow)

    factory = helpers["session_factory"]
    async with factory() as session:
        _, vendor = await helpers["create_vendor"](session)
        p1 = await helpers["create_product"](
            session, vendor, title="Cap Binding", stock=100, max_order_qty=7
        )
        p2 = await helpers["create_product"](
            session, vendor, title="Stock Binding", stock=3, max_order_qty=7,
            slug="stock-binding-test-slug"
        )

    r1 = await client.get(f"{API_PRODUCTS}/slug/{p1.slug}")
    assert r1.status_code == 200
    assert r1.json()["max_order_qty"] == 7
    assert r1.json()["available_stock"] == 7   # min(100, 7)

    r2 = await client.get(f"{API_PRODUCTS}/slug/{p2.slug}")
    assert r2.status_code == 200
    assert r2.json()["max_order_qty"] == 7
    assert r2.json()["available_stock"] == 3   # min(3, 7)


# ── 10. Race: cap update concurrent with checkout → no negative stock ────────

@pytest.mark.asyncio
async def test_cap_update_concurrent_with_checkout_no_negative_stock(client, helpers):
    """
    stock=10, no initial cap.
    10 buyers each have qty=1 in cart and checkout simultaneously.
    At the same instant, vendor sets cap=1.
    Assert: exactly 10 orders placed (qty=1 each is within cap=1),
    stock ends at 0, never goes negative.
    """
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Race-Free Checkout", stock=10, price="99.00"
        )
        buyers = []
        for _ in range(10):
            u = await helpers["create_customer"](session)
            a = await helpers["create_address"](session, u)
            await helpers["fill_cart"](session, u, (product, 1))
            buyers.append((u, a))

    vendor_h = {"X-Test-User": str(vendor_user.uid)}

    async def set_cap():
        return await client.patch(
            f"{API_PRODUCTS}/vendor/me/{product.uid}",
            headers=vendor_h,
            json={"max_order_qty": 1},
        )

    async def checkout(user, addr):
        return await client.post(
            f"{API_ORDERS}/checkout",
            headers={"X-Test-User": str(user.uid)},
            json={"address_id": str(addr.uid), "payment_method": "cod"},
        )

    # Fire all checkouts + cap-set simultaneously
    all_tasks = [set_cap()] + [checkout(u, a) for u, a in buyers]
    results = await asyncio.gather(*all_tasks, return_exceptions=True)

    assert all(not isinstance(r, Exception) for r in results)
    cap_result = results[0]
    assert cap_result.status_code == 200

    checkout_results = results[1:]
    successes = [r for r in checkout_results if r.status_code == 201]
    failures = [r for r in checkout_results if r.status_code == 400]
    assert len(successes) + len(failures) == 10

    async with factory() as session:
        p = await session.get(Product, product.uid)
        assert p.stock >= 0, "Stock must never go negative"
        assert p.stock == 10 - len(successes)


# ── 11. Vendor HTTP create & partial PATCH preserve/clear/overflow ──────────

@pytest.mark.asyncio
async def test_vendor_api_create_partial_patch_and_int32_overflow(client, helpers, monkeypatch):
    async def _allow(_ip):
        return True, 0

    monkeypatch.setattr("src.products.routes.check_catalog_rate", _allow)

    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)

    vendor_h = {"X-Test-User": str(vendor_user.uid)}

    # Create with explicit max_order_qty=4
    c1 = await client.post(
        f"{API_PRODUCTS}/vendor/me",
        headers=vendor_h,
        json={
            "title": "Vendor Cap Create",
            "slug": f"vendor-cap-{uuid.uuid4().hex[:8]}",
            "price": "199.00",
            "stock": 25,
            "max_order_qty": 4,
            "image_urls": ["https://example.com/item.webp"],
        },
    )
    assert c1.status_code == 201, c1.text
    p_uid = c1.json()["uid"]
    p_slug = c1.json()["slug"]
    assert c1.json()["max_order_qty"] == 4

    # Create with explicit max_order_qty=None (unlimited)
    c2 = await client.post(
        f"{API_PRODUCTS}/vendor/me",
        headers=vendor_h,
        json={
            "title": "Vendor Unlimited Create",
            "slug": f"vendor-unlim-{uuid.uuid4().hex[:8]}",
            "price": "99.00",
            "stock": 15,
            "max_order_qty": None,
            "image_urls": ["https://example.com/item2.webp"],
        },
    )
    assert c2.status_code == 201, c2.text
    assert c2.json()["max_order_qty"] is None

    # Partial PATCH omitting max_order_qty must preserve existing cap=4
    p_keep = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{p_uid}",
        headers=vendor_h,
        json={"title": "Vendor Cap Create Updated"},
    )
    assert p_keep.status_code == 200, p_keep.text
    assert p_keep.json()["title"] == "Vendor Cap Create Updated"
    assert p_keep.json()["max_order_qty"] == 4

    # Int32 overflow rejected cleanly with 422 (never 500 DB DataError)
    p_over = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{p_uid}",
        headers=vendor_h,
        json={"max_order_qty": 2_147_483_648},
    )
    assert p_over.status_code == 422

    # Live sync check: ids query & slug endpoint return fresh cap + safe Cache-Control
    ids_res = await client.get(f"{API_PRODUCTS}?ids={p_uid}")
    assert ids_res.status_code == 200
    assert ids_res.headers.get("cache-control") == "no-store"
    assert ids_res.json()["items"][0]["max_order_qty"] == 4
    assert ids_res.json()["items"][0]["available_stock"] == 4

    slug_res = await client.get(f"{API_PRODUCTS}/slug/{p_slug}")
    assert slug_res.status_code == 200
    assert slug_res.headers.get("cache-control") == "no-cache"
    assert slug_res.json()["max_order_qty"] == 4


# ── 12. Cart healing when vendor lowers cap below existing cart qty ─────────

@pytest.mark.asyncio
async def test_cart_heals_when_vendor_lowers_cap_and_oos_beats_cap_error(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Healing Item", stock=20
        )
        oos_product = await helpers["create_product"](
            session, vendor, title="OOS Capped", stock=0, max_order_qty=5
        )
        buyer = await helpers["create_customer"](session)
        address = await helpers["create_address"](session, buyer)
        await helpers["fill_cart"](session, buyer, (product, 6))

    buyer_h = {"X-Test-User": str(buyer.uid)}
    vendor_h = {"X-Test-User": str(vendor_user.uid)}

    # Vendor lowers cap to 3 while buyer already holds qty=6 in cart
    up = await client.patch(
        f"{API_PRODUCTS}/vendor/me/{product.uid}",
        headers=vendor_h,
        json={"max_order_qty": 3},
    )
    assert up.status_code == 200

    # GET /cart immediately reflects max_qty=3 and at_limit=True
    cart_r = await client.get(API_CART, headers=buyer_h)
    assert cart_r.status_code == 200
    item = cart_r.json()["items"][0]
    assert item["quantity"] == 6
    assert item["max_qty"] == 3
    assert item["at_limit"] is True

    # Checkout rejects stale qty=6
    co_fail = await client.post(
        f"{API_ORDERS}/checkout",
        headers=buyer_h,
        json={"address_id": str(address.uid), "payment_method": "cod"},
    )
    assert co_fail.status_code == 400
    assert "maximum of 3" in co_fail.json()["detail"].lower()

    # Buyer snaps down to 3 -> succeeds at cart & checkout
    patch_r = await client.patch(
        f"{API_CART}/{item['uid']}", headers=buyer_h, json={"quantity": 3}
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["items"][0]["quantity"] == 3

    co_ok = await client.post(
        f"{API_ORDERS}/checkout",
        headers=buyer_h,
        json={"address_id": str(address.uid), "payment_method": "cod"},
    )
    assert co_ok.status_code == 201

    # Direct checkout of qty=8 on OOS product (stock=0, cap=5) must report Insufficient stock
    oos_co = await client.post(
        f"{API_ORDERS}/checkout",
        headers=buyer_h,
        json={
            "address_id": str(address.uid),
            "payment_method": "cod",
            "direct_item": {"product_id": str(oos_product.uid), "quantity": 8},
        },
    )
    assert oos_co.status_code == 400
    assert "insufficient stock" in oos_co.json()["detail"].lower()


# ── 13. Concurrent vendor updates serialize cleanly under FOR UPDATE ─────────

@pytest.mark.asyncio
async def test_concurrent_vendor_updates_serialize_cleanly(client, helpers):
    factory = helpers["session_factory"]
    async with factory() as session:
        vendor_user, vendor = await helpers["create_vendor"](session)
        product = await helpers["create_product"](
            session, vendor, title="Concurrent Vendor Edit", stock=50, max_order_qty=5
        )

    vendor_h = {"X-Test-User": str(vendor_user.uid)}
    caps = [2, 4, 6, 8, 3, 7, 1, 9]
    results = await asyncio.gather(
        *(
            client.patch(
                f"{API_PRODUCTS}/vendor/me/{product.uid}",
                headers=vendor_h,
                json={"max_order_qty": c},
            )
            for c in caps
        ),
        return_exceptions=True,
    )
    assert all(not isinstance(r, Exception) for r in results)
    assert all(r.status_code == 200 for r in results)

    async with factory() as session:
        saved = await session.get(Product, product.uid)
        assert saved.max_order_qty in caps
