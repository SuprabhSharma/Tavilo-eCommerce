"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "c70507d83494"
down_revision: Union[str, Sequence[str], None] = "c3a7e91b2d44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
