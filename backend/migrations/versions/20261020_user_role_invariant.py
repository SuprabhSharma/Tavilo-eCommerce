"""Align user-role defaults and database invariants with marketplace auth."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import context, op


revision: str = "20261020_user_role_invariant"
down_revision: Union[str, Sequence[str], None] = "20261020_marketplace_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROLE_CONSTRAINT = "ck_users_role_valid"


def upgrade() -> None:
    if context.is_offline_mode():
        op.execute("UPDATE users SET role = 'customer' WHERE role = 'user'")
        op.alter_column(
            "users",
            "role",
            existing_type=sa.String(),
            existing_nullable=False,
            server_default=sa.text("'customer'"),
        )
        op.create_check_constraint(
            ROLE_CONSTRAINT,
            "users",
            "role IN ('customer', 'vendor', 'admin')",
        )
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in inspector.get_table_names():
        raise RuntimeError("Cannot apply user-role invariant: users table is missing")

    # The retired books application used ``user``.  It is the only legacy
    # value that can be safely mapped to the marketplace customer role.
    op.execute(
        sa.text("UPDATE users SET role = 'customer' WHERE role = 'user'")
    )

    invalid_roles = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM users
            WHERE role IS NULL OR role NOT IN ('customer', 'vendor', 'admin')
            """
        )
    ).scalar_one()
    if invalid_roles:
        raise RuntimeError(
            "Cannot enforce user roles: database contains unsupported role values"
        )

    op.alter_column(
        "users",
        "role",
        existing_type=sa.String(),
        existing_nullable=False,
        server_default=sa.text("'customer'")
    )

    check_constraints = {
        item["name"] for item in sa.inspect(bind).get_check_constraints("users")
    }
    if ROLE_CONSTRAINT not in check_constraints:
        op.create_check_constraint(
            ROLE_CONSTRAINT,
            "users",
            "role IN ('customer', 'vendor', 'admin')",
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role_valid"
        )
    )
    op.alter_column(
        "users",
        "role",
        existing_type=sa.String(),
        existing_nullable=False,
        server_default=sa.text("'user'")
    )
