"""Add online indexes for public storefront directory search."""

from alembic import op


revision = "20261124_vendor_dir_idx"
down_revision = "20261120_catalog_keyset_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_vendors_approved_name_uid "
            "ON vendors (store_name ASC, uid ASC) WHERE status = 'approved'"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_vendors_approved_name_trgm "
            "ON vendors USING gin (store_name gin_trgm_ops) WHERE status = 'approved'"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_vendors_approved_slug_trgm "
            "ON vendors USING gin (slug gin_trgm_ops) WHERE status = 'approved'"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_vendors_approved_slug_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_vendors_approved_name_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_vendors_approved_name_uid")
