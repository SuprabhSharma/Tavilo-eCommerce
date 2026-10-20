"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "74ddc5d5afa3"
down_revision: Union[str, Sequence[str], None] = "cd7d2b744a82"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
