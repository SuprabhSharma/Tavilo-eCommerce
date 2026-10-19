"""pending email registrations

Revision ID: 8a2f6c1d9b40
Revises: 20261016_security_audit
Create Date: 2026-10-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "8a2f6c1d9b40"
down_revision: Union[str, Sequence[str], None] = "20261016_security_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pending_registrations" not in inspector.get_table_names():
        op.create_table(
            "pending_registrations",
            sa.Column("uid", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("username", sa.String(length=30), nullable=False),
            sa.Column("first_name", sa.String(length=120), nullable=False),
            sa.Column("last_name", sa.String(length=120), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("verification_token_hash", sa.String(length=64), nullable=False),
            sa.Column("token_expires_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
            sa.Column("last_sent_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
            sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("uid"),
            sa.UniqueConstraint("email", name="uq_pending_registrations_email"),
            sa.UniqueConstraint("username", name="uq_pending_registrations_username"),
            sa.UniqueConstraint(
                "verification_token_hash",
                name="uq_pending_registrations_token_hash",
            ),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pending_registrations_token_expires_at "
        "ON pending_registrations (token_expires_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_pending_registrations_token_expires_at")
    op.execute("DROP TABLE IF EXISTS pending_registrations")
