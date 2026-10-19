"""add order idempotency and stock safety constraints

Revision ID: f4b7c8d9e0a1
Revises: c570e9bbaa15
Create Date: 2026-10-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f4b7c8d9e0a1"
down_revision: Union[str, Sequence[str], None] = "c570e9bbaa15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Repair legacy data before adding the invariant.
    op.execute("UPDATE products SET stock = 0 WHERE stock < 0")
    op.create_check_constraint(
        "ck_products_stock_non_negative",
        "products",
        "stock >= 0",
    )

    op.add_column(
        "orders",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_orders_idempotency_key",
        "orders",
        ["idempotency_key"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_orders_user_idempotency_key",
        "orders",
        ["user_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_orders_user_idempotency_key", "orders", type_="unique"
    )
    op.drop_index("ix_orders_idempotency_key", table_name="orders")
    op.drop_column("orders", "idempotency_key")
    op.drop_constraint("ck_products_stock_non_negative", "products", type_="check")
