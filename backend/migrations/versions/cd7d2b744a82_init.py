"""Create the current Tavilo marketplace schema.

The original revision was generated for the retired books application and
attempted to alter a table that it never created.  The revision id is kept so
existing databases can continue traversing the Alembic graph.
"""

from typing import Sequence, Union

from migrations.schema import create_current_schema


revision: str = "cd7d2b744a82"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    create_current_schema()


def downgrade() -> None:
    # The baseline is intentionally not destructive.  Production rollbacks
    # should use a backup or a forward migration rather than drop marketplace
    # data.
    pass
