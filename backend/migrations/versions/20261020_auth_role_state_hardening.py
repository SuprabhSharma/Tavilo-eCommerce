"""Make account role, vendor state, and password resets enforceable in PostgreSQL."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql


revision: str = "20261020_auth_role_hardening"
down_revision: Union[str, Sequence[str], None] = "20261020_user_role_invariant"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add one-time reset credentials and deferred role/vendor invariants."""
    if not context.is_offline_mode():
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        tables = set(inspector.get_table_names())
        if "session_version" not in {
            column["name"] for column in inspector.get_columns("users")
        }:
            op.add_column(
                "users",
                sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
            )
        if "password_reset_tokens" not in tables:
            _create_password_reset_table()
        constraints = {
            item["name"] for item in sa.inspect(bind).get_check_constraints("vendors")
        }
        if "ck_vendors_status_valid" not in constraints:
            op.create_check_constraint(
                "ck_vendors_status_valid",
                "vendors",
                "status IN ('pending', 'approved', 'suspended')",
            )
        _assert_role_vendor_data_is_consistent()
    else:
        op.add_column(
            "users",
            sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
        )
        _create_password_reset_table()
        op.create_check_constraint(
            "ck_vendors_status_valid",
            "vendors",
            "status IN ('pending', 'approved', 'suspended')",
        )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_user_vendor_role_invariant()
        RETURNS trigger AS $$
        DECLARE
            affected_user uuid;
            account_role text;
            has_vendor_profile boolean;
            has_approved_vendor boolean;
        BEGIN
            IF TG_TABLE_NAME = 'users' THEN
                IF TG_OP = 'DELETE' THEN
                    affected_user := OLD.uid;
                ELSE
                    affected_user := NEW.uid;
                END IF;
            ELSE
                IF TG_OP = 'DELETE' THEN
                    affected_user := OLD.user_id;
                ELSE
                    affected_user := NEW.user_id;
                END IF;
            END IF;

            SELECT role INTO account_role FROM users WHERE uid = affected_user;
            IF account_role IS NULL THEN
                RETURN NULL;
            END IF;

            SELECT EXISTS(
                SELECT 1 FROM vendors WHERE user_id = affected_user
            ) INTO has_vendor_profile;
            SELECT EXISTS(
                SELECT 1 FROM vendors
                WHERE user_id = affected_user AND status = 'approved'
            ) INTO has_approved_vendor;

            IF account_role = 'vendor' AND NOT has_approved_vendor THEN
                RAISE EXCEPTION 'vendor role requires an approved vendor profile';
            END IF;
            IF account_role <> 'vendor' AND has_approved_vendor THEN
                RAISE EXCEPTION 'approved vendor profile requires vendor role';
            END IF;
            IF account_role = 'admin' AND has_vendor_profile THEN
                RAISE EXCEPTION 'administrator accounts cannot own vendor profiles';
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS ct_users_vendor_role_invariant ON users")
    op.execute("DROP TRIGGER IF EXISTS ct_vendors_user_role_invariant ON vendors")
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER ct_users_vendor_role_invariant
        AFTER INSERT OR UPDATE OR DELETE ON users
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_user_vendor_role_invariant()
        """
    )
    op.execute(
        """
        CREATE CONSTRAINT TRIGGER ct_vendors_user_role_invariant
        AFTER INSERT OR UPDATE OR DELETE ON vendors
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_user_vendor_role_invariant()
        """
    )


def _create_password_reset_table() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("uid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.uid"]),
        sa.PrimaryKeyConstraint("uid"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"]
    )
    op.create_index(
        "ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"]
    )
    op.create_index(
        "ix_password_reset_tokens_expires_at", "password_reset_tokens", ["expires_at"]
    )
    op.create_index(
        "ix_password_reset_tokens_created_at", "password_reset_tokens", ["created_at"]
    )


def _assert_role_vendor_data_is_consistent() -> None:
    """Fail closed rather than guessing how to repair privileged live data."""
    inconsistent = op.get_bind().execute(
        sa.text(
            """
            SELECT 1
            FROM users u
            WHERE
                (u.role = 'vendor' AND NOT EXISTS (
                    SELECT 1 FROM vendors v
                    WHERE v.user_id = u.uid AND v.status = 'approved'
                ))
                OR
                (u.role <> 'vendor' AND EXISTS (
                    SELECT 1 FROM vendors v
                    WHERE v.user_id = u.uid AND v.status = 'approved'
                ))
                OR
                (u.role = 'admin' AND EXISTS (
                    SELECT 1 FROM vendors v WHERE v.user_id = u.uid
                ))
            LIMIT 1
            """
        )
    ).first()
    if inconsistent:
        raise RuntimeError(
            "Cannot enforce user/vendor authorization invariants: repair "
            "contradictory users.role and vendors.status rows before upgrading."
        )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS ct_users_vendor_role_invariant ON users")
    op.execute("DROP TRIGGER IF EXISTS ct_vendors_user_role_invariant ON vendors")
    op.execute("DROP FUNCTION IF EXISTS enforce_user_vendor_role_invariant()")
    op.drop_constraint("ck_vendors_status_valid", "vendors", type_="check")
    op.drop_index("ix_password_reset_tokens_created_at", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_expires_at", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "session_version")
