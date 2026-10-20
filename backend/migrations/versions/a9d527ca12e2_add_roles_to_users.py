"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "a9d527ca12e2"
down_revision: Union[str, Sequence[str], None] = "c70507d83494"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
