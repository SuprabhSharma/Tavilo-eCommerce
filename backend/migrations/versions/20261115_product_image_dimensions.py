"""Add width and height nullable columns to product_images table (Phase 2).

Revision ID: 20261115_product_image_dimensions
Revises: 20261113_search_trgm_index
Create Date: 2026-11-15 13:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261115_product_image_dimensions"
down_revision: Union[str, Sequence[str], None] = "20261113_search_trgm_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("product_images", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("product_images", sa.Column("height", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("product_images", "height")
    op.drop_column("product_images", "width")
