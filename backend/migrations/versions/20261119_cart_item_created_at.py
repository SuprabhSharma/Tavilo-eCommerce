"""Add created_at to cart_items table.

Enables stable deterministic ordering of cart items:
- Most recently added product appears at the top (created_at DESC).
- Increasing/decreasing quantity does not reorder or shuffle products.

Revision ID: 20261119_cart_item_created_at
Revises: 20261119_max_order_qty
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261119_cart_item_created_at"
down_revision: Union[str, Sequence[str], None] = "20261119_max_order_qty"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cart_items",
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_cart_items_cart_id_created_at",
        "cart_items",
        ["cart_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_cart_items_cart_id_created_at", table_name="cart_items")
    op.drop_column("cart_items", "created_at")
