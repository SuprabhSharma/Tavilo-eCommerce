"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "f4b7c8d9e0a1"
down_revision: Union[str, Sequence[str], None] = "c570e9bbaa15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
