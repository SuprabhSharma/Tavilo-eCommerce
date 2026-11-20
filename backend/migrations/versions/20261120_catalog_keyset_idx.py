"""Add online indexes for product cursor pagination and searchable vendor fields.

All indexes are built concurrently so applying this migration does not block
catalog reads or writes on a live store.
"""

from alembic import op

revision = "20261120_catalog_keyset_idx"
down_revision = "20261120_order_page_idx"
branch_labels = None
depends_on = None


_INDEXES = (
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_active_created_uid "
    "ON products (created_at DESC, uid DESC) WHERE status = 'active'",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_active_category_created_uid "
    "ON products (category_id, created_at DESC, uid DESC) WHERE status = 'active'",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_active_price_uid "
    "ON products (price ASC, uid ASC) WHERE status = 'active'",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_active_rating_created_uid "
    "ON products (rating_avg DESC, created_at DESC, uid DESC) WHERE status = 'active'",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_vendor_created_uid "
    "ON products (vendor_id, created_at DESC, uid DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_slug_trgm "
    "ON products USING gin (slug gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_sku_trgm "
    "ON products USING gin (sku gin_trgm_ops)",
)


def upgrade() -> None:
    # pg_trgm is established by the earlier search migration. Keep this
    # migration independent for databases upgraded from an older snapshot.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        for statement in _INDEXES:
            op.execute(statement)


def downgrade() -> None:
    names = (
        "ix_products_sku_trgm", "ix_products_slug_trgm",
        "ix_products_vendor_created_uid", "ix_products_active_rating_created_uid",
        "ix_products_active_price_uid", "ix_products_active_category_created_uid",
        "ix_products_active_created_uid",
    )
    with op.get_context().autocommit_block():
        for name in names:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")