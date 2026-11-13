"""Add pg_trgm GIN indexes for fast product search (BUG-03 fix).

Enables trigram-based ILIKE search so leading-wildcard queries like
%term% use the GIN index instead of a sequential scan.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261113_search_trgm_index"
down_revision: Union[str, Sequence[str], None] = "20261107_catalog_query_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable trigram extension (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN trigram index on title — makes ILIKE '%query%' use the index
    op.create_index(
        "ix_products_title_trgm",
        "products",
        ["title"],
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
        if_not_exists=True,
    )

    # Optional: GIN trigram index on description for future description search
    op.create_index(
        "ix_products_description_trgm",
        "products",
        ["description"],
        postgresql_using="gin",
        postgresql_ops={"description": "gin_trgm_ops"},
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_products_description_trgm", table_name="products", if_exists=True)
    op.drop_index("ix_products_title_trgm", table_name="products", if_exists=True)
