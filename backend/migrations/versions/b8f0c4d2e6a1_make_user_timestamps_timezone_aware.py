"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "b8f0c4d2e6a1"
down_revision: Union[str, Sequence[str], None] = "74ddc5d5afa3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
