"""Shared DDL for the current Tavilo marketplace schema.

This module is deliberately outside ``migrations/versions`` so Alembic does
not treat it as a revision.  Both the baseline and the compatibility repair
revision use the same definitions, which keeps a fresh install and an
existing installation on the same schema.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context
from alembic import op
from sqlalchemy.dialects import postgresql


UUID = postgresql.UUID(as_uuid=True)
TIMESTAMPTZ = postgresql.TIMESTAMP(timezone=True)
JSONB = postgresql.JSONB


def _table_exists(table_names: set[str], name: str) -> bool:
    return name in table_names


def create_current_schema() -> None:
    """Create every table used by the current marketplace application.

    The function is safe to call against a partially-created database.  This
    is important for production databases that were created with the old
    books-only migration chain or with ``SQLModel.metadata.create_all``.
    """

    offline = context.is_offline_mode()
    bind = None if offline else op.get_bind()
    inspector = None if offline else sa.inspect(bind)
    table_names = set() if offline else set(inspector.get_table_names())

    def create(name: str, *columns: sa.Column, **kwargs: object) -> None:
        if not _table_exists(table_names, name):
            op.create_table(name, *columns, **kwargs)
            table_names.add(name)

    create(
        "users",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("first_name", sa.String(), nullable=False),
        sa.Column("last_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="customer"),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.PrimaryKeyConstraint("uid", name="pk_users"),
    )
    create(
        "pending_registrations",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("username", sa.String(30), nullable=False),
        sa.Column("first_name", sa.String(120), nullable=False),
        sa.Column("last_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("verification_token_hash", sa.String(64), nullable=False),
        sa.Column("token_expires_at", TIMESTAMPTZ, nullable=False),
        sa.Column("last_sent_at", TIMESTAMPTZ, nullable=False),
        sa.Column("created_at", TIMESTAMPTZ, nullable=False),
        sa.PrimaryKeyConstraint("uid", name="pk_pending_registrations"),
        sa.UniqueConstraint("email", name="uq_pending_registrations_email"),
        sa.UniqueConstraint("username", name="uq_pending_registrations_username"),
        sa.UniqueConstraint(
            "verification_token_hash", name="uq_pending_registrations_token_hash"
        ),
    )
    create(
        "revoked_tokens",
        sa.Column("jti", sa.String(36), nullable=False),
        sa.Column("expires_at", TIMESTAMPTZ, nullable=False),
        sa.Column("revoked_at", TIMESTAMPTZ, nullable=False),
        sa.PrimaryKeyConstraint("jti", name="pk_revoked_tokens"),
    )
    create(
        "audit_logs",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("actor_user_id", UUID, nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=True),
        sa.Column("target_id", sa.String(120), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", TIMESTAMPTZ, nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.uid"], name="fk_audit_logs_actor_user_id_users"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_audit_logs"),
    )
    create(
        "vendors",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("store_name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(140), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"], name="fk_vendors_user_id_users"),
        sa.PrimaryKeyConstraint("uid", name="pk_vendors"),
        sa.UniqueConstraint("user_id", name="uq_vendors_user_id"),
        sa.UniqueConstraint("slug", name="uq_vendors_slug"),
    )
    create(
        "categories",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("parent_id", UUID, nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["categories.uid"], name="fk_categories_parent_id_categories"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_categories"),
        sa.UniqueConstraint("slug", name="uq_categories_slug"),
    )
    create(
        "products",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("vendor_id", UUID, nullable=False),
        sa.Column("category_id", UUID, nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(280), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("mrp", sa.Numeric(12, 2), nullable=True),
        sa.Column("stock", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(80), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("rating_avg", sa.Numeric(3, 2), nullable=False, server_default="0.00"),
        sa.Column("rating_count", sa.Integer(), nullable=False),
        sa.Column("attributes", JSONB, nullable=True),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.CheckConstraint("stock >= 0", name="ck_products_stock_non_negative"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.uid"], name="fk_products_vendor_id_vendors"),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.uid"], name="fk_products_category_id_categories"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_products"),
        sa.UniqueConstraint("slug", name="uq_products_slug"),
        sa.UniqueConstraint("sku", name="uq_products_sku"),
    )
    create(
        "product_images",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("product_id", UUID, nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.uid"], name="fk_product_images_product_id_products"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_product_images"),
    )
    create(
        "services",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("vendor_id", UUID, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(280), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.uid"], name="fk_services_vendor_id_vendors"),
        sa.PrimaryKeyConstraint("uid", name="pk_services"),
        sa.UniqueConstraint("slug", name="uq_services_slug"),
    )
    create(
        "service_images",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("service_id", UUID, nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["service_id"], ["services.uid"], name="fk_service_images_service_id_services"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_service_images"),
    )
    create(
        "carts",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"], name="fk_carts_user_id_users"),
        sa.PrimaryKeyConstraint("uid", name="pk_carts"),
        sa.UniqueConstraint("user_id", name="uq_carts_user_id"),
    )
    create(
        "cart_items",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("cart_id", UUID, nullable=False),
        sa.Column("product_id", UUID, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["cart_id"], ["carts.uid"], name="fk_cart_items_cart_id_carts"),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.uid"], name="fk_cart_items_product_id_products"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_cart_items"),
        sa.UniqueConstraint("cart_id", "product_id", name="uq_cart_product"),
    )
    create(
        "wishlists",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("product_id", UUID, nullable=False),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"], name="fk_wishlists_user_id_users"),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.uid"], name="fk_wishlists_product_id_products"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_wishlists"),
        sa.UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
    )
    create(
        "addresses",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("line1", sa.String(200), nullable=False),
        sa.Column("line2", sa.String(200), nullable=True),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("state", sa.String(80), nullable=False),
        sa.Column("pincode", sa.String(10), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"], name="fk_addresses_user_id_users"),
        sa.PrimaryKeyConstraint("uid", name="pk_addresses"),
    )
    create(
        "orders",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("address_snapshot", JSONB, nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(30), nullable=False, server_default="cod"),
        sa.Column("payment_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("status", sa.String(20), nullable=False, server_default="placed"),
        sa.Column("idempotency_key", sa.String(255), nullable=True),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"], name="fk_orders_user_id_users"),
        sa.PrimaryKeyConstraint("uid", name="pk_orders"),
        sa.UniqueConstraint(
            "user_id", "idempotency_key", name="uq_orders_user_idempotency_key"
        ),
    )
    create(
        "sub_orders",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("order_id", UUID, nullable=False),
        sa.Column("vendor_id", UUID, nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="placed"),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.uid"], name="fk_sub_orders_order_id_orders"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.uid"], name="fk_sub_orders_vendor_id_vendors"),
        sa.PrimaryKeyConstraint("uid", name="pk_sub_orders"),
    )
    create(
        "order_items",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("sub_order_id", UUID, nullable=False),
        sa.Column("product_id", UUID, nullable=False),
        sa.Column("title_snapshot", sa.String(255), nullable=False),
        sa.Column("price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["sub_order_id"], ["sub_orders.uid"], name="fk_order_items_sub_order_id_sub_orders"
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.uid"], name="fk_order_items_product_id_products"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_order_items"),
    )
    create(
        "reviews",
        sa.Column("uid", UUID, nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("review_text", sa.Text(), nullable=False),
        sa.Column("user_id", UUID, nullable=True),
        sa.Column("product_id", UUID, nullable=True),
        sa.Column("verified_purchase", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", TIMESTAMPTZ, nullable=True),
        sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"], name="fk_reviews_user_id_users"),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.uid"], name="fk_reviews_product_id_products"
        ),
        sa.PrimaryKeyConstraint("uid", name="pk_reviews"),
    )

    # Repair columns from an old live schema before creating indexes that rely
    # on those columns (especially the partial review index).
    if not offline:
        _repair_legacy_columns()

    # Explicit indexes mirror the indexes declared in src.db.models.  The
    # existence checks make the repair revision safe after create_all().
    indexes: tuple[tuple[str, str, tuple[str, ...]], ...] = (
        ("ix_pending_registrations_verification_token_hash", "pending_registrations", ("verification_token_hash",)),
        ("ix_pending_registrations_token_expires_at", "pending_registrations", ("token_expires_at",)),
        ("ix_revoked_tokens_expires_at", "revoked_tokens", ("expires_at",)),
        ("ix_audit_logs_action", "audit_logs", ("action",)),
        ("ix_audit_logs_created_at", "audit_logs", ("created_at",)),
        ("ix_products_vendor_id", "products", ("vendor_id",)),
        ("ix_products_category_id", "products", ("category_id",)),
        ("ix_products_status", "products", ("status",)),
        ("ix_products_price", "products", ("price",)),
        ("ix_products_created_at", "products", ("created_at",)),
        ("ix_services_vendor_id", "services", ("vendor_id",)),
        ("ix_services_status", "services", ("status",)),
        ("ix_services_created_at", "services", ("created_at",)),
        ("ix_orders_idempotency_key", "orders", ("idempotency_key",)),
        ("ix_orders_created_at", "orders", ("created_at",)),
    )
    existing_indexes = (
        set()
        if offline
        else {
            index["name"]
            for table in table_names
            for index in sa.inspect(bind).get_indexes(table)
        }
    )
    for index_name, table, columns in indexes:
        if (offline or index_name not in existing_indexes) and table in table_names:
            op.create_index(index_name, table, list(columns), unique=False)

    # This is the only partial index in the model and cannot be represented by
    # a normal UniqueConstraint in SQLAlchemy's portable DDL.
    if (
        (offline or "uq_review_user_product_verified" not in existing_indexes)
        and "reviews" in table_names
    ):
        op.create_index(
            "uq_review_user_product_verified",
            "reviews",
            ["user_id", "product_id"],
            unique=True,
            postgresql_where=sa.text(
                "product_id IS NOT NULL AND verified_purchase = true"
            ),
        )

def _repair_legacy_columns() -> None:
    """Bring the few columns from the old live schema to current names.

    The old application could have reached production through ``create_all``
    before Alembic was introduced.  Those databases commonly have an older
    users table and a review column named ``review_test``.  New installations
    never enter these branches; existing rows receive conservative values so
    the repair remains additive and does not discard customer data.
    """

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    def columns(table: str) -> set[str]:
        return {column["name"] for column in sa.inspect(bind).get_columns(table)}

    if "users" in tables:
        user_columns = columns("users")
        if "role" not in user_columns:
            op.add_column(
                "users",
                sa.Column("role", sa.String(), nullable=False, server_default="customer"),
            )
        if "password_hash" not in user_columns:
            op.add_column(
                "users",
                sa.Column("password_hash", sa.String(), nullable=False, server_default=""),
            )
        op.execute("UPDATE users SET role = 'customer' WHERE role = 'user'")

    if "reviews" in tables:
        review_columns = columns("reviews")
        if "review_text" not in review_columns:
            if "review_test" in review_columns:
                op.alter_column("reviews", "review_test", new_column_name="review_text")
            else:
                op.add_column(
                    "reviews",
                    sa.Column("review_text", sa.Text(), nullable=False, server_default=""),
                )
        review_columns = columns("reviews")
        if "rating" not in review_columns:
            op.add_column(
                "reviews",
                sa.Column("rating", sa.Integer(), nullable=False, server_default="1"),
            )
        if "user_id" not in review_columns:
            op.add_column("reviews", sa.Column("user_id", UUID, nullable=True))
        if "product_id" not in review_columns:
            op.add_column("reviews", sa.Column("product_id", UUID, nullable=True))
        if "verified_purchase" not in review_columns:
            op.add_column(
                "reviews",
                sa.Column(
                    "verified_purchase",
                    sa.Boolean(),
                    nullable=False,
                    server_default="false",
                ),
            )
        review_columns = columns("reviews")
        if "created_at" not in review_columns:
            op.add_column(
                "reviews",
                sa.Column("created_at", TIMESTAMPTZ, nullable=True),
            )
        if "updated_at" not in review_columns:
            op.add_column(
                "reviews",
                sa.Column("updated_at", TIMESTAMPTZ, nullable=True),
            )


def drop_legacy_book_objects() -> None:
    """Remove objects that belonged exclusively to the retired book domain."""

    # Drop the old review FK/column first so the books table can be removed.
    op.execute("ALTER TABLE reviews DROP COLUMN IF EXISTS book_id")
    op.execute("DROP TABLE IF EXISTS book_tags")
    op.execute("DROP TABLE IF EXISTS booktag")
    op.execute("DROP TABLE IF EXISTS tags")
    op.execute("DROP TABLE IF EXISTS books")
