import asyncio

from sqlalchemy import text

from src.db.main import async_engine


async def main() -> None:
    queries = {
        "alembic_version": "SELECT version_num FROM alembic_version",
        "idempotency_column": """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'orders'
                  AND column_name = 'idempotency_key'
            )
        """,
        "orders_constraints": """
            SELECT conname, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'public.orders'::regclass
            ORDER BY conname
        """,
        "products_constraints": """
            SELECT conname, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'public.products'::regclass
            ORDER BY conname
        """,
        "reviews_columns": """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'reviews'
            ORDER BY ordinal_position
        """,
        "reviews_indexes": """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'reviews'
            ORDER BY indexname
        """,
    }
    async with async_engine.connect() as connection:
        for name, query in queries.items():
            rows = (await connection.execute(text(query))).all()
            print(name, rows)
    await async_engine.dispose()


asyncio.run(main())
