"""Add indexes for the public catalog query paths."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261107_catalog_query_indexes"
down_revision: Union[str, Sequence[str], None] = "20261106_guest_merge_receipt"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_products_status_created_at",
        "products",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_products_status_category_id",
        "products",
        ["status", "category_id"],
    )
    op.create_index("ix_vendors_status", "vendors", ["status"])


def downgrade() -> None:
    op.drop_index("ix_vendors_status", table_name="vendors")
    op.drop_index("ix_products_status_category_id", table_name="products")
    op.drop_index("ix_products_status_created_at", table_name="products")
