"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "c3a7e91b2d44"
down_revision: Union[str, Sequence[str], None] = "b8f0c4d2e6a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
