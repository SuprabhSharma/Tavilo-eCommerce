"""Enforce one default address per user."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261031_addr_default"
down_revision: Union[str, Sequence[str], None] = "20261020_auth_role_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Repair legacy rows deterministically before enforcing the database rule.
    op.execute(
        """
        WITH ranked AS (
            SELECT uid,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id
                       ORDER BY is_default DESC, created_at DESC, uid DESC
                   ) AS row_number
            FROM addresses
        )
        UPDATE addresses AS address
        SET is_default = (ranked.row_number = 1)
        FROM ranked
        WHERE address.uid = ranked.uid
        """
    )
    op.create_index(
        "uq_addresses_one_default_per_user",
        "addresses",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )


def downgrade() -> None:
    op.drop_index("uq_addresses_one_default_per_user", table_name="addresses")