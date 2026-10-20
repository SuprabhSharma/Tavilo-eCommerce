"""repair the legacy review text column name

Revision ID: 20261020_review_schema_fix
Revises: 20261020_review_delivery
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261020_review_schema_fix"
down_revision: Union[str, Sequence[str], None] = "20261020_review_delivery"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Historical migration c570e9bbaa15 accidentally called this column
    # review_test. Support both historical and create_all-created schemas.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'reviews' AND column_name = 'review_test'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'reviews' AND column_name = 'review_text'
            ) THEN
                ALTER TABLE reviews RENAME COLUMN review_test TO review_text;
            ELSIF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'reviews' AND column_name = 'review_text'
            ) THEN
                ALTER TABLE reviews
                ADD COLUMN review_text TEXT NOT NULL DEFAULT '';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # Keep the application column intact on downgrade; renaming back would
    # reintroduce the historical API-breaking typo.
    pass
