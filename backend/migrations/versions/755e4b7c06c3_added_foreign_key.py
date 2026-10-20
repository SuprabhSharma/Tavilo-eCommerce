"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "755e4b7c06c3"
down_revision: Union[str, Sequence[str], None] = "a9d527ca12e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
