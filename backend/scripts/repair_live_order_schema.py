import asyncio

from sqlalchemy import text

from src.db.main import async_engine


STATEMENTS = (
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255)",
    """
    CREATE INDEX IF NOT EXISTS ix_orders_idempotency_key
    ON orders (idempotency_key)
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.orders'::regclass
              AND conname = 'uq_orders_user_idempotency_key'
        ) THEN
            ALTER TABLE orders
            ADD CONSTRAINT uq_orders_user_idempotency_key
            UNIQUE (user_id, idempotency_key);
        END IF;
    END $$
    """,
    "UPDATE products SET stock = 0 WHERE stock < 0",
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.products'::regclass
              AND conname = 'ck_products_stock_non_negative'
        ) THEN
            ALTER TABLE products
            ADD CONSTRAINT ck_products_stock_non_negative CHECK (stock >= 0);
        END IF;
    END $$
    """,
)


async def main() -> None:
    async with async_engine.begin() as connection:
        for statement in STATEMENTS:
            await connection.execute(text(statement))
    await async_engine.dispose()
    print("Live order schema repaired.")


asyncio.run(main())
