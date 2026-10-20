"""Reconcile an existing database with the current marketplace schema.

Fresh databases are created by the baseline revision.  This final revision
also runs for installations that already recorded one of the old book-era
revisions, so production upgrades do not depend on those obsolete DDL
operations having succeeded.
"""

from typing import Sequence, Union

from alembic import context, op

from migrations.schema import create_current_schema, drop_legacy_book_objects


revision: str = "20261020_marketplace_schema"
down_revision: Union[str, Sequence[str], None] = "20261020_rm_orphan_reviews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The baseline emits the complete fresh-install SQL in offline mode.  A
    # second idempotent create pass cannot be rendered without inspecting a
    # live database, so only emit the safe legacy cleanup statements here.
    if context.is_offline_mode():
        drop_legacy_book_objects()
        return
    create_current_schema()
    drop_legacy_book_objects()


def downgrade() -> None:
    # The repair is intentionally non-destructive.  Restoring removed legacy
    # objects would require data and schema definitions no longer supported by
    # the application.
    pass
