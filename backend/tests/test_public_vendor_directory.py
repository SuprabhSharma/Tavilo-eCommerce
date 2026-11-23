import uuid

import pytest

from src.db.models import Vendor


@pytest.mark.asyncio
async def test_public_vendor_directory_only_returns_approved_stores(client, helpers):
    async with helpers["session_factory"]() as session:
        _, approved = await helpers["create_vendor"](session, name="Patanjali Store")
        await helpers["create_vendor"](session, name="Another Approved Store")
        pending_owner = await helpers["create_customer"](session)
        pending = Vendor(
            user_id=pending_owner.uid,
            store_name="Pending Store",
            slug=f"pending-{uuid.uuid4().hex[:8]}",
            status="pending",
        )
        session.add(pending)
        await session.commit()

    unfiltered_response = await client.get("/api/v1/vendors?limit=48")
    assert unfiltered_response.status_code == 200

    response = await client.get("/api/v1/vendors?q=patanjali")

    assert response.status_code == 200
    stores = response.json()["items"]
    assert [store["uid"] for store in stores] == [str(approved.uid)]
    assert stores[0]["slug"] == approved.slug
