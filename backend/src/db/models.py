"""
Database models for the Marketplace platform.

Model hierarchy:
  User → Vendor (1:1)
  Category (self-referential, 2 levels)
  Product → ProductImage (1:many)
  Product ↔ Tag (many:many via BookTag for backward compat)
  Cart → CartItem
  Wishlist
  Address
  Order → SubOrder → OrderItem
  Review (attached to Product)
  RevokedToken
  Book (legacy, kept for backward compatibility)
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

import sqlalchemy.dialects.postgresql as pg
from sqlalchemy import UniqueConstraint, Index, Numeric, Text
from sqlmodel import Column, Field, Relationship, SQLModel


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    username: str
    email: str
    first_name: str
    last_name: str
    # role: customer | vendor | admin  (was: user | admin)
    role: str = Field(
        sa_column=Column(pg.VARCHAR, nullable=False, server_default="customer")
    )
    is_verified: bool = Field(default=False)
    password_hash: str = Field(exclude=True)
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    # Relationships
    books: list["Book"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    reviews: list["Review"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    vendor_profile: Optional["Vendor"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin", "uselist": False},
    )
    cart: Optional["Cart"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin", "uselist": False},
    )
    wishlist_items: list["Wishlist"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    addresses: list["Address"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    orders: list["Order"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<User {self.username}>"


# ---------------------------------------------------------------------------
# Pending registration
# ---------------------------------------------------------------------------

class PendingRegistration(SQLModel, table=True):
    """Signup data that becomes a User only after email verification."""

    __tablename__ = "pending_registrations"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    email: str = Field(sa_column=Column(pg.VARCHAR(320), nullable=False, unique=True))
    username: str = Field(sa_column=Column(pg.VARCHAR(30), nullable=False, unique=True))
    first_name: str = Field(sa_column=Column(pg.VARCHAR(120), nullable=False))
    last_name: str = Field(sa_column=Column(pg.VARCHAR(120), nullable=False))
    password_hash: str = Field(
        sa_column=Column(pg.VARCHAR(255), nullable=False)
    )
    verification_token_hash: str = Field(
        sa_column=Column(pg.VARCHAR(64), nullable=False, unique=True, index=True)
    )
    token_expires_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, index=True)
    )
    last_sent_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False)
    )
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False)
    )

    def __repr__(self):
        return f"<PendingRegistration {self.email}>"


# ---------------------------------------------------------------------------
# Token blocklist
# ---------------------------------------------------------------------------

class RevokedToken(SQLModel, table=True):
    """A JWT that must no longer be accepted before its normal expiry."""

    __tablename__ = "revoked_tokens"

    jti: str = Field(primary_key=True, max_length=36)
    expires_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, index=True)
    )
    revoked_at: datetime = Field(
        default_factory=datetime.now,
        sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False),
    )


class AuditLog(SQLModel, table=True):
    """Immutable record of security-sensitive actions."""

    __tablename__ = "audit_logs"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    actor_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.uid")
    action: str = Field(sa_column=Column(pg.VARCHAR(80), nullable=False, index=True))
    target_type: Optional[str] = Field(default=None, max_length=40)
    target_id: Optional[str] = Field(default=None, max_length=120)
    metadata_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(
        default_factory=datetime.now,
        sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, index=True),
    )


# ---------------------------------------------------------------------------
# Vendor
# ---------------------------------------------------------------------------

class Vendor(SQLModel, table=True):
    __tablename__ = "vendors"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    user_id: uuid.UUID = Field(foreign_key="users.uid", nullable=False, unique=True)
    store_name: str = Field(sa_column=Column(pg.VARCHAR(120), nullable=False))
    slug: str = Field(sa_column=Column(pg.VARCHAR(140), nullable=False, unique=True))
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    logo_url: Optional[str] = Field(default=None)
    # status: pending | approved | suspended
    status: str = Field(
        sa_column=Column(pg.VARCHAR(20), nullable=False, server_default="pending")
    )
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    user: Optional[User] = Relationship(
        back_populates="vendor_profile",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    products: list["Product"] = Relationship(
        back_populates="vendor",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    services: list["ServiceOffering"] = Relationship(
        back_populates="vendor",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    sub_orders: list["SubOrder"] = Relationship(
        back_populates="vendor",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Vendor {self.store_name}>"


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class Category(SQLModel, table=True):
    __tablename__ = "categories"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    name: str = Field(sa_column=Column(pg.VARCHAR(80), nullable=False))
    slug: str = Field(sa_column=Column(pg.VARCHAR(100), nullable=False, unique=True))
    # parent_id nullable — supports 2 levels (root + child)
    parent_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="categories.uid", nullable=True
    )
    image_url: Optional[str] = Field(default=None)
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    products: list["Product"] = Relationship(
        back_populates="category",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Category {self.name}>"


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

class Product(SQLModel, table=True):
    __tablename__ = "products"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    vendor_id: uuid.UUID = Field(foreign_key="vendors.uid", nullable=False)
    category_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="categories.uid", nullable=True
    )
    title: str = Field(sa_column=Column(pg.VARCHAR(255), nullable=False))
    slug: str = Field(sa_column=Column(pg.VARCHAR(280), nullable=False, unique=True))
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    # Money — always Decimal, never float
    price: Decimal = Field(
        sa_column=Column(Numeric(12, 2), nullable=False, default=0)
    )
    mrp: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    stock: int = Field(default=0)
    sku: Optional[str] = Field(default=None, sa_column=Column(pg.VARCHAR(80), unique=True))
    # status: draft | active | archived
    status: str = Field(
        sa_column=Column(pg.VARCHAR(20), nullable=False, server_default="draft")
    )
    # Denormalised rating fields — updated when reviews change
    rating_avg: Decimal = Field(
        default=Decimal("0.00"),
        sa_column=Column(Numeric(3, 2), nullable=False, server_default="0.00"),
    )
    rating_count: int = Field(default=0)
    # Flexible attributes: author, publisher, language for books; etc.
    attributes: Optional[dict] = Field(
        default=None, sa_column=Column(pg.JSONB, nullable=True)
    )
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now, index=True)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    __table_args__ = (
        Index("ix_products_vendor_id", "vendor_id"),
        Index("ix_products_category_id", "category_id"),
        Index("ix_products_status", "status"),
        Index("ix_products_price", "price"),
    )

    vendor: Optional[Vendor] = Relationship(
        back_populates="products",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    category: Optional[Category] = Relationship(
        back_populates="products",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    images: list["ProductImage"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    reviews: list["Review"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    cart_items: list["CartItem"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    wishlist_items: list["Wishlist"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    order_items: list["OrderItem"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Product {self.title}>"


# ---------------------------------------------------------------------------
# ProductImage
# ---------------------------------------------------------------------------

class ProductImage(SQLModel, table=True):
    __tablename__ = "product_images"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    product_id: uuid.UUID = Field(foreign_key="products.uid", nullable=False)
    url: str = Field(sa_column=Column(pg.VARCHAR(500), nullable=False))
    position: int = Field(default=0)

    product: Optional[Product] = Relationship(
        back_populates="images",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<ProductImage {self.url}>"


# ---------------------------------------------------------------------------
# Service offerings
# ---------------------------------------------------------------------------

class ServiceOffering(SQLModel, table=True):
    __tablename__ = "services"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    vendor_id: uuid.UUID = Field(foreign_key="vendors.uid", nullable=False)
    title: str = Field(sa_column=Column(pg.VARCHAR(255), nullable=False))
    slug: str = Field(sa_column=Column(pg.VARCHAR(280), nullable=False, unique=True))
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    price: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False, default=0))
    duration_minutes: int = Field(default=60, ge=1)
    status: str = Field(
        sa_column=Column(pg.VARCHAR(20), nullable=False, server_default="active")
    )
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now, index=True)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    __table_args__ = (
        Index("ix_services_vendor_id", "vendor_id"),
        Index("ix_services_status", "status"),
    )

    vendor: Optional[Vendor] = Relationship(
        back_populates="services",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    images: list["ServiceImage"] = Relationship(
        back_populates="service",
        sa_relationship_kwargs={"lazy": "selectin"},
    )


class ServiceImage(SQLModel, table=True):
    __tablename__ = "service_images"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    service_id: uuid.UUID = Field(foreign_key="services.uid", nullable=False)
    url: str = Field(sa_column=Column(pg.VARCHAR(500), nullable=False))
    position: int = Field(default=0)

    service: Optional[ServiceOffering] = Relationship(
        back_populates="images",
        sa_relationship_kwargs={"lazy": "selectin"},
    )


# ---------------------------------------------------------------------------
# Cart + CartItem
# ---------------------------------------------------------------------------

class Cart(SQLModel, table=True):
    __tablename__ = "carts"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    user_id: uuid.UUID = Field(foreign_key="users.uid", nullable=False, unique=True)
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    user: Optional[User] = Relationship(
        back_populates="cart",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    items: list["CartItem"] = Relationship(
        back_populates="cart",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Cart user_id={self.user_id}>"


class CartItem(SQLModel, table=True):
    __tablename__ = "cart_items"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    cart_id: uuid.UUID = Field(foreign_key="carts.uid", nullable=False)
    product_id: uuid.UUID = Field(foreign_key="products.uid", nullable=False)
    quantity: int = Field(default=1, ge=1)

    __table_args__ = (
        UniqueConstraint("cart_id", "product_id", name="uq_cart_product"),
    )

    cart: Optional[Cart] = Relationship(
        back_populates="items",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    product: Optional[Product] = Relationship(
        back_populates="cart_items",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<CartItem product_id={self.product_id} qty={self.quantity}>"


# ---------------------------------------------------------------------------
# Wishlist
# ---------------------------------------------------------------------------

class Wishlist(SQLModel, table=True):
    __tablename__ = "wishlists"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    user_id: uuid.UUID = Field(foreign_key="users.uid", nullable=False)
    product_id: uuid.UUID = Field(foreign_key="products.uid", nullable=False)
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
    )

    user: Optional[User] = Relationship(
        back_populates="wishlist_items",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    product: Optional[Product] = Relationship(
        back_populates="wishlist_items",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Wishlist user_id={self.user_id} product_id={self.product_id}>"


# ---------------------------------------------------------------------------
# Address
# ---------------------------------------------------------------------------

class Address(SQLModel, table=True):
    __tablename__ = "addresses"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    user_id: uuid.UUID = Field(foreign_key="users.uid", nullable=False)
    name: str = Field(sa_column=Column(pg.VARCHAR(120), nullable=False))
    phone: str = Field(sa_column=Column(pg.VARCHAR(20), nullable=False))
    line1: str = Field(sa_column=Column(pg.VARCHAR(200), nullable=False))
    line2: Optional[str] = Field(default=None, sa_column=Column(pg.VARCHAR(200)))
    city: str = Field(sa_column=Column(pg.VARCHAR(80), nullable=False))
    state: str = Field(sa_column=Column(pg.VARCHAR(80), nullable=False))
    pincode: str = Field(sa_column=Column(pg.VARCHAR(10), nullable=False))
    is_default: bool = Field(default=False)
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    user: Optional[User] = Relationship(
        back_populates="addresses",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Address {self.line1}, {self.city}>"


# ---------------------------------------------------------------------------
# Order → SubOrder → OrderItem  (multi-vendor core)
# ---------------------------------------------------------------------------

class Order(SQLModel, table=True):
    __tablename__ = "orders"

    uid: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    user_id: uuid.UUID = Field(foreign_key="users.uid", nullable=False)
    # Snapshot of the address at checkout time — never changes
    address_snapshot: dict = Field(
        sa_column=Column(pg.JSONB, nullable=False)
    )
    total: Decimal = Field(
        sa_column=Column(Numeric(12, 2), nullable=False)
    )
    # payment_method: cod | online_mock
    payment_method: str = Field(
        sa_column=Column(pg.VARCHAR(30), nullable=False, server_default="cod")
    )
    # payment_status: pending | paid | failed | refunded
    payment_status: str = Field(
        sa_column=Column(pg.VARCHAR(20), nullable=False, server_default="pending")
    )
    # status: placed | confirmed | shipped | delivered | cancelled
    status: str = Field(
        sa_column=Column(pg.VARCHAR(20), nullable=False, server_default="placed")
    )
    idempotency_key: Optional[str] = Field(
        default=None,
        sa_column=Column(pg.VARCHAR(255), nullable=True, index=True),
    )
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now, index=True)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_orders_user_idempotency_key"),
    )

    user: Optional[User] = Relationship(
        back_populates="orders",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    sub_orders: list["SubOrder"] = Relationship(
        back_populates="order",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Order {self.uid} status={self.status}>"


class SubOrder(SQLModel, table=True):
    """One sub-order per vendor per order — this is the multi-vendor core."""

    __tablename__ = "sub_orders"

    uid: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    order_id: uuid.UUID = Field(foreign_key="orders.uid", nullable=False)
    vendor_id: uuid.UUID = Field(foreign_key="vendors.uid", nullable=False)
    subtotal: Decimal = Field(
        sa_column=Column(Numeric(12, 2), nullable=False)
    )
    # status: placed | confirmed | shipped | delivered | cancelled
    status: str = Field(
        sa_column=Column(pg.VARCHAR(20), nullable=False, server_default="placed")
    )
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    order: Optional[Order] = Relationship(
        back_populates="sub_orders",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    vendor: Optional[Vendor] = Relationship(
        back_populates="sub_orders",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    items: list["OrderItem"] = Relationship(
        back_populates="sub_order",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    @property
    def store_name(self) -> Optional[str]:
        return self.vendor.store_name if self.vendor else None

    def __repr__(self):
        return f"<SubOrder {self.uid} vendor={self.vendor_id}>"


class OrderItem(SQLModel, table=True):
    __tablename__ = "order_items"

    uid: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    sub_order_id: uuid.UUID = Field(foreign_key="sub_orders.uid", nullable=False)
    product_id: uuid.UUID = Field(foreign_key="products.uid", nullable=False)
    # Snapshots — past orders never change when product data changes
    title_snapshot: str = Field(sa_column=Column(pg.VARCHAR(255), nullable=False))
    price_snapshot: Decimal = Field(
        sa_column=Column(Numeric(12, 2), nullable=False)
    )
    quantity: int = Field(nullable=False)

    sub_order: Optional[SubOrder] = Relationship(
        back_populates="items",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    product: Optional[Product] = Relationship(
        back_populates="order_items",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    @property
    def line_total(self) -> Decimal:
        if self.price_snapshot is not None and self.quantity is not None:
            return Decimal(str(self.price_snapshot)) * self.quantity
        return Decimal("0.00")

    @property
    def image_url(self) -> str | None:
        if self.product and self.product.images:
            return self.product.images[0].url
        return None

    @property
    def product_slug(self) -> str | None:
        if self.product:
            return self.product.slug
        return None

    def __repr__(self):
        return f"<OrderItem product={self.product_id} qty={self.quantity}>"


# ---------------------------------------------------------------------------
# Review  (attaches to Product, was attached to Book)
# ---------------------------------------------------------------------------

class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    rating: int = Field(ge=1, le=5)
    review_text: str = Field(sa_column=Column(Text, nullable=False))
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.uid")
    # product_id — new primary attachment (migrated from book_id)
    product_id: Optional[uuid.UUID] = Field(default=None, foreign_key="products.uid")
    # book_id kept for backward compat during migration
    book_id: Optional[uuid.UUID] = Field(default=None, foreign_key="books.uid")
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    __table_args__ = (
        # One review per user per product
        UniqueConstraint("user_id", "product_id", name="uq_review_user_product"),
    )

    user: Optional[User] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    product: Optional[Product] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    book: Optional["Book"] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Review rating={self.rating}>"


# ---------------------------------------------------------------------------
# Legacy: Book + Tag  (kept — books are one category of products)
# ---------------------------------------------------------------------------

class BookTag(SQLModel, table=True):
    book_id: uuid.UUID = Field(default=None, foreign_key="books.uid", primary_key=True)
    tag_id: uuid.UUID = Field(default=None, foreign_key="tags.uid", primary_key=True)


class Tag(SQLModel, table=True):
    __tablename__ = "tags"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    name: str = Field(sa_column=Column(pg.VARCHAR, nullable=False))
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    books: list["Book"] = Relationship(
        link_model=BookTag,
        back_populates="tags",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self) -> str:
        return f"<Tag {self.name}>"


class Book(SQLModel, table=True):
    __tablename__ = "books"

    uid: uuid.UUID = Field(
        sa_column=Column(pg.UUID, nullable=False, primary_key=True, default=uuid.uuid4)
    )
    title: str
    author: str
    publisher: str
    published_date: date
    page_count: int
    language: str
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.uid")
    created_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )
    updated_at: datetime = Field(
        sa_column=Column(pg.TIMESTAMP(timezone=True), default=datetime.now)
    )

    user: Optional[User] = Relationship(back_populates="books")
    reviews: list["Review"] = Relationship(
        back_populates="book",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    tags: list["Tag"] = Relationship(
        link_model=BookTag,
        back_populates="books",
        sa_relationship_kwargs={"lazy": "selectin"},
    )

    def __repr__(self):
        return f"<Book {self.title}>"
