"""Historical checkpoint retained for Alembic compatibility."""

from typing import Sequence, Union

revision: str = "20261020_remove_legacy_books"
down_revision: Union[str, Sequence[str], None] = "20261020_merge_review_pending"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
