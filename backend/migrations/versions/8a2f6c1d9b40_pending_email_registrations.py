"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "8a2f6c1d9b40"
down_revision: Union[str, Sequence[str], None] = "20261016_security_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
