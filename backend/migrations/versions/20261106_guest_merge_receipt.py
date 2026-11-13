"""Add guest_cart_merge_receipts table and conflicts_json column for idempotent guest-to-auth merges."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261106_guest_merge_receipt"
down_revision: Union[str, Sequence[str], None] = "20261031_addr_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Check if table already exists
    table_exists = conn.execute(
        sa.text("SELECT to_regclass('public.guest_cart_merge_receipts')")
    ).scalar()

    if not table_exists:
        op.create_table(
            "guest_cart_merge_receipts",
            sa.Column(
                "uid",
                sa.dialects.postgresql.UUID(as_uuid=True),
                primary_key=True,
                nullable=False,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "user_id",
                sa.dialects.postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.uid", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "guest_cart_id",
                sa.VARCHAR(36),
                nullable=False,
            ),
            sa.Column(
                "conflicts_json",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "merged_at",
                sa.TIMESTAMP(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
        )
        # Idempotency constraint: one receipt per (user, guest_cart)
        op.create_unique_constraint(
            "uq_guest_merge_user_guest_cart",
            "guest_cart_merge_receipts",
            ["user_id", "guest_cart_id"],
        )
        # Index for fast lookups by user
        op.create_index(
            "ix_gcmr_user_id",
            "guest_cart_merge_receipts",
            ["user_id"],
        )
        # Index for maintenance queries by time
        op.create_index(
            "ix_gcmr_merged_at",
            "guest_cart_merge_receipts",
            ["merged_at"],
        )
    else:
        # Table exists: check if conflicts_json column exists
        col_exists = conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'guest_cart_merge_receipts' AND column_name = 'conflicts_json'"
            )
        ).scalar()
        if not col_exists:
            op.add_column(
                "guest_cart_merge_receipts",
                sa.Column("conflicts_json", sa.Text(), nullable=True),
            )


def downgrade() -> None:
    op.drop_table("guest_cart_merge_receipts")
