"""Add max_order_qty to products table.

Flipkart/Amazon style per-product order quantity cap.
- NULL means no cap (only real stock is the limit).
- SET default = NULL (no cap) so existing products are unaffected.
- CHECK constraint ensures cap >= 1 when specified.

Revision ID: 20261119_max_order_qty
Revises: f4b7c8d9e0a1
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261119_max_order_qty"
down_revision: Union[str, Sequence[str], None] = "20261115_image_dims"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "max_order_qty",
            sa.Integer(),
            nullable=True,
            comment="Vendor-set per-order quantity cap (NULL = no cap beyond real stock)",
        ),
    )
    op.create_check_constraint(
        "ck_products_max_order_qty_positive",
        "products",
        "max_order_qty IS NULL OR max_order_qty >= 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_products_max_order_qty_positive", "products", type_="check"
    )
    op.drop_column("products", "max_order_qty")
