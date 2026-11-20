"""Add indexes for paginated vendor order browsing and search."""

from typing import Sequence, Union

from alembic import op

revision: str = "20261120_order_page_idx"
down_revision: Union[str, Sequence[str], None] = "20261119_cart_item_created_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep these builds online while the production order tables are in use.
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_sub_orders_vendor_created_uid",
            "sub_orders",
            ["vendor_id", "created_at", "uid"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        op.create_index(
            "ix_sub_orders_vendor_status_created_uid",
            "sub_orders",
            ["vendor_id", "status", "created_at", "uid"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        op.create_index(
            "ix_order_items_sub_order_id",
            "order_items",
            ["sub_order_id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        op.create_index(
            "ix_order_items_title_snapshot_trgm",
            "order_items",
            ["title_snapshot"],
            postgresql_using="gin",
            postgresql_ops={"title_snapshot": "gin_trgm_ops"},
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_order_items_title_snapshot_trgm",
            table_name="order_items",
            postgresql_concurrently=True,
            if_exists=True,
        )
        op.drop_index(
            "ix_order_items_sub_order_id",
            table_name="order_items",
            postgresql_concurrently=True,
            if_exists=True,
        )
        op.drop_index(
            "ix_sub_orders_vendor_status_created_uid",
            table_name="sub_orders",
            postgresql_concurrently=True,
            if_exists=True,
        )
        op.drop_index(
            "ix_sub_orders_vendor_created_uid",
            table_name="sub_orders",
            postgresql_concurrently=True,
            if_exists=True,
        )