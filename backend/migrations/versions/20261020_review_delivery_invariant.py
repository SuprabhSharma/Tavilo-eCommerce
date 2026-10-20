"""enforce one product review per customer and repair rating aggregates

Revision ID: 20261020_review_delivery
Revises: 20261016_security_audit
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261020_review_delivery"
down_revision: Union[str, Sequence[str], None] = "20261016_security_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE reviews
        ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN NOT NULL DEFAULT false
        """
    )
    # Trust only reviews whose customer has a delivered order line for the
    # same product. Legacy rows remain stored but are no longer public.
    op.execute(
        """
        UPDATE reviews AS r
        SET verified_purchase = true
        WHERE r.product_id IS NOT NULL
          AND r.user_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM order_items AS oi
              JOIN sub_orders AS so ON so.uid = oi.sub_order_id
              JOIN orders AS o ON o.uid = so.order_id
              WHERE oi.product_id = r.product_id
                AND o.user_id = r.user_id
                AND so.status = 'delivered'
          )
        """
    )
    # Keep the newest verified row if legacy data contains duplicates.
    op.execute(
        """
        DELETE FROM reviews older
        USING reviews newer
        WHERE older.verified_purchase = true
          AND newer.verified_purchase = true
          AND older.user_id = newer.user_id
          AND older.product_id = newer.product_id
          AND (
              older.created_at < newer.created_at
              OR (older.created_at = newer.created_at AND older.uid < newer.uid)
          )
        """
    )
    op.execute("ALTER TABLE reviews DROP CONSTRAINT IF EXISTS uq_review_user_product")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_review_user_product_verified
        ON reviews (user_id, product_id)
        WHERE product_id IS NOT NULL AND verified_purchase = true
        """
    )
    op.execute(
        """
        UPDATE products AS p
        SET rating_avg = COALESCE(aggregate.average_rating, 0)::numeric(3, 2),
            rating_count = COALESCE(aggregate.review_count, 0)
        FROM (
            SELECT product_id, AVG(rating) AS average_rating, COUNT(*) AS review_count
            FROM reviews
            WHERE product_id IS NOT NULL AND verified_purchase = true
            GROUP BY product_id
        ) AS aggregate
        WHERE p.uid = aggregate.product_id
        """
    )
    op.execute(
        """
        UPDATE products
        SET rating_avg = 0, rating_count = 0
        WHERE uid NOT IN (
            SELECT DISTINCT product_id
            FROM reviews
            WHERE product_id IS NOT NULL AND verified_purchase = true
        )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS uq_review_user_product_verified"
    )
    op.execute("ALTER TABLE reviews DROP COLUMN IF EXISTS verified_purchase")
