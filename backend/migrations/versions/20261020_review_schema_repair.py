"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "20261020_review_schema_fix"
down_revision: Union[str, Sequence[str], None] = "20261020_review_delivery"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
