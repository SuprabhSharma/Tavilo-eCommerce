"""
Database seeder.

Usage:
    python -m src.db.seed

Creates:
    1 admin, 3 vendors (auto-approved), 8 categories, and 60 products.
"""
import asyncio
import random
from decimal import Decimal

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.main import async_engine, init_db
from src.db.models import (
    Cart, Category, Order, OrderItem, Product, ProductImage,
    SubOrder, User, Vendor, Wishlist,
)
from src.auth.utils import generate_passwd_hash
from src.config import Config

# ── Helpers ───────────────────────────────────────────────────────────────────

def slug(s: str) -> str:
    return s.lower().replace(" ", "-").replace("'", "").replace("&", "and")


CATEGORIES = [
    ("Electronics", None),
    ("Smartphones", "Electronics"),
    ("Laptops", "Electronics"),
    ("Fashion", None),
    ("Men's Clothing", "Fashion"),
    ("Women's Clothing", "Fashion"),
    ("Books", None),
    ("Home & Kitchen", None),
]

PRODUCT_TEMPLATES = [
    # (title, category_name, base_price, mrp)
    ("Samsung Galaxy S24", "Smartphones", Decimal("59999"), Decimal("69999")),
    ("iPhone 15 Pro", "Smartphones", Decimal("134900"), Decimal("139900")),
    ("OnePlus 12", "Smartphones", Decimal("64999"), Decimal("69999")),
    ("Redmi Note 13 Pro", "Smartphones", Decimal("24999"), Decimal("29999")),
    ("POCO X6 Pro", "Smartphones", Decimal("22999"), Decimal("27999")),
    ("Dell XPS 15", "Laptops", Decimal("149900"), Decimal("179900")),
    ("MacBook Air M3", "Laptops", Decimal("114900"), Decimal("119900")),
    ("Lenovo ThinkPad X1", "Laptops", Decimal("129900"), Decimal("149900")),
    ("HP Pavilion 15", "Laptops", Decimal("62999"), Decimal("74999")),
    ("Asus ZenBook 14", "Laptops", Decimal("74999"), Decimal("84999")),
    ("Levi's 511 Jeans", "Men's Clothing", Decimal("2999"), Decimal("4500")),
    ("Allen Solly Formal Shirt", "Men's Clothing", Decimal("1299"), Decimal("1999")),
    ("Nike Dri-FIT T-Shirt", "Men's Clothing", Decimal("1499"), Decimal("2499")),
    ("Peter England Chinos", "Men's Clothing", Decimal("1899"), Decimal("2799")),
    ("Van Heusen Blazer", "Men's Clothing", Decimal("4999"), Decimal("7999")),
    ("Zara Floral Dress", "Women's Clothing", Decimal("2499"), Decimal("3999")),
    ("H&M Casual Kurti", "Women's Clothing", Decimal("799"), Decimal("1299")),
    ("AND Formal Blazer", "Women's Clothing", Decimal("3999"), Decimal("5999")),
    ("W for Woman Salwar", "Women's Clothing", Decimal("1299"), Decimal("1999")),
    ("Biba Ethnic Jacket", "Women's Clothing", Decimal("2199"), Decimal("3499")),
    ("Atomic Habits", "Books", Decimal("299"), Decimal("499")),
    ("The Psychology of Money", "Books", Decimal("349"), Decimal("599")),
    ("Rich Dad Poor Dad", "Books", Decimal("249"), Decimal("399")),
    ("Deep Work", "Books", Decimal("399"), Decimal("599")),
    ("Zero to One", "Books", Decimal("499"), Decimal("699")),
    ("Philips Air Fryer HD9200", "Home & Kitchen", Decimal("5499"), Decimal("7999")),
    ("Prestige Iris Induction", "Home & Kitchen", Decimal("2499"), Decimal("3499")),
    ("Instant Pot Duo", "Home & Kitchen", Decimal("9999"), Decimal("13999")),
    ("Milton Thermosteel Bottle", "Home & Kitchen", Decimal("699"), Decimal("999")),
    ("Pigeon Mini Cooker", "Home & Kitchen", Decimal("1299"), Decimal("1999")),
]

ADDITIONAL = [
    ("Sony WH-1000XM5 Headphones", "Electronics", Decimal("24990"), Decimal("29990")),
    ("boAt Rockerz 450 Pro", "Electronics", Decimal("1499"), Decimal("2999")),
    ("JBL Flip 6 Speaker", "Electronics", Decimal("9999"), Decimal("13499")),
    ("Realme Buds Air 5", "Electronics", Decimal("3999"), Decimal("5999")),
    ("Apple Watch Series 9", "Electronics", Decimal("41900"), Decimal("45900")),
    ("Mi Smart Band 8", "Electronics", Decimal("3499"), Decimal("4999")),
    ("Noise ColorFit Ultra", "Electronics", Decimal("2499"), Decimal("3999")),
    ("Canon EOS 1500D", "Electronics", Decimal("29990"), Decimal("39990")),
    ("GoPro Hero 12", "Electronics", Decimal("34990"), Decimal("44990")),
    ("Logitech MX Master 3S", "Electronics", Decimal("9995"), Decimal("12995")),
    ("Corsair K95 RGB Keyboard", "Electronics", Decimal("12999"), Decimal("17999")),
    ('Samsung 27" Curved Monitor', "Electronics", Decimal("22990"), Decimal("29990")),
    ("WD My Passport 2TB", "Electronics", Decimal("5499"), Decimal("6999")),
    ("SanDisk 1TB SSD", "Electronics", Decimal("7499"), Decimal("9999")),
    ("Anker 65W GaN Charger", "Electronics", Decimal("2499"), Decimal("3499")),
    ("U.S. Polo Assn. Sneakers", "Men's Clothing", Decimal("2499"), Decimal("3999")),
    ("Raymond Wool Suit", "Men's Clothing", Decimal("9999"), Decimal("15999")),
    ("Fabindia Cotton Kurta", "Men's Clothing", Decimal("1499"), Decimal("2499")),
    ("Myntra Hoodie", "Men's Clothing", Decimal("1299"), Decimal("1999")),
    ("Puma Running Shoes", "Men's Clothing", Decimal("3499"), Decimal("5999")),
    ("Global Desi Anarkali", "Women's Clothing", Decimal("1999"), Decimal("3499")),
    ("FabAlley Co-ord Set", "Women's Clothing", Decimal("1699"), Decimal("2799")),
    ("Aurelia Linen Tunic", "Women's Clothing", Decimal("899"), Decimal("1499")),
    ("Marks & Spencer Jeans", "Women's Clothing", Decimal("2999"), Decimal("4499")),
    ("SATYA PAUL Silk Saree", "Women's Clothing", Decimal("8999"), Decimal("12999")),
    ("Think and Grow Rich", "Books", Decimal("199"), Decimal("299")),
    ("The Lean Startup", "Books", Decimal("499"), Decimal("699")),
    ("Sapiens", "Books", Decimal("599"), Decimal("799")),
    ("The Alchemist", "Books", Decimal("199"), Decimal("299")),
    ("1984 by George Orwell", "Books", Decimal("249"), Decimal("399")),
]


async def seed():
    if Config.APP_ENV not in {"development", "test"}:
        raise RuntimeError("Database seeding is disabled outside development/test environments")
    if not Config.ADMIN_BOOTSTRAP_PASSWORD:
        raise RuntimeError(
            "Set ADMIN_BOOTSTRAP_PASSWORD in backend/.env before running the seed command"
        )
    await init_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker
    session_factory = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        print("Seeding admin...")
        admin = User(
            username="admin",
            email="admin@marketplace.com",
            first_name="Admin",
            last_name="User",
            role="admin",
            is_verified=True,
            password_hash=generate_passwd_hash(Config.ADMIN_BOOTSTRAP_PASSWORD),
        )
        session.add(admin)
        await session.flush()

        print("Seeding vendors...")
        vendor_users = []
        for i in range(1, 4):
            u = User(
                username=f"vendor{i}",
                email=f"vendor{i}@marketplace.com",
                first_name=f"Vendor",
                last_name=str(i),
                role="vendor",
                is_verified=True,
                password_hash=generate_passwd_hash("Vendor@1234"),
            )
            session.add(u)
            await session.flush()
            vendor_users.append(u)

        stores = ["TechMart India", "FashionHub", "BookNest"]
        vendors = []
        for i, u in enumerate(vendor_users):
            v = Vendor(
                user_id=u.uid,
                store_name=stores[i],
                slug=slug(stores[i]),
                description=f"{stores[i]} — your one-stop shop.",
                status="approved",
            )
            session.add(v)
            await session.flush()
            vendors.append(v)

        print("Seeding categories...")
        cat_map = {}
        for name, parent_name in CATEGORIES:
            parent = cat_map.get(parent_name) if parent_name else None
            parent_id = parent.uid if parent else None
            c = Category(name=name, slug=slug(name), parent_id=parent_id)
            session.add(c)
            await session.flush()
            cat_map[name] = c

        print("Seeding 60 products...")
        all_templates = PRODUCT_TEMPLATES + ADDITIONAL
        for idx, (title, cat_name, price, mrp) in enumerate(all_templates):
            vendor = vendors[idx % len(vendors)]
            category = cat_map.get(cat_name)
            p = Product(
                vendor_id=vendor.uid,
                category_id=category.uid if category else None,
                title=title,
                slug=slug(title) + f"-{idx}",
                description=f"{title} — top quality product available at best price.",
                price=price,
                mrp=mrp,
                stock=random.randint(5, 200),
                status="active",
                # Product ratings are derived only from verified delivered
                # reviews; seed products start with no customer feedback.
                rating_avg=Decimal("0.00"),
                rating_count=0,
            )
            session.add(p)
            await session.flush()
            # add image placeholder
            session.add(ProductImage(product_id=p.uid, url=f"https://picsum.photos/seed/{idx}/400/400", position=0))

        print("Skipping sample reviews: ratings require delivered order lines.")

        await session.commit()
        print("Seed complete!")
        print("  Admin: admin@marketplace.com / password from ADMIN_BOOTSTRAP_PASSWORD")
        print("  Vendors: vendor1@marketplace.com .. vendor3@marketplace.com / Vendor@1234")


if __name__ == "__main__":
    asyncio.run(seed())
