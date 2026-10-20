"""merge the review and pending-registration migration heads

Revision ID: 20261020_merge_review_pending
Revises: 20261020_review_schema_fix, 8a2f6c1d9b40
"""

from typing import Sequence, Union


revision: str = "20261020_merge_review_pending"
down_revision: Union[str, Sequence[str], None] = (
    "20261020_review_schema_fix",
    "8a2f6c1d9b40",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
