"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "c570e9bbaa15"
down_revision: Union[str, Sequence[str], None] = "e1a9d1f7c3b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
