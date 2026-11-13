import pytest


API_PRODUCTS = "/api/v1/products"


@pytest.mark.asyncio
async def test_vendor_product_pagination_and_summary(client, helpers):
    async with helpers["session_factory"]() as session:
        vendor_user, vendor = await helpers["create_vendor"](session, name="Catalog Store")
        _, other_vendor = await helpers["create_vendor"](session, name="Other Store")
        for index in range(3):
            await helpers["create_product"](
                session, vendor, title=f"Searchable item {index}", price="10.00", stock=6
            )
        await helpers["create_product"](
            session,
            other_vendor,
            title="Searchable other vendor item",
            price="99.00",
            stock=1,
        )

    headers = {"X-Test-User": str(vendor_user.uid)}
    page = await client.get(
        f"{API_PRODUCTS}/vendor/me?page=1&page_size=2&q=Searchable",
        headers=headers,
    )
    assert page.status_code == 200
    assert page.json()["total"] == 3
    assert page.json()["page"] == 1
    assert page.json()["pages"] == 2
    assert len(page.json()["items"]) == 2

    summary = await client.get(f"{API_PRODUCTS}/vendor/me/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json() == {
        "total": 3,
        "active": 3,
        "low_stock": 0,
        "inventory_value": 180.0,
    }
