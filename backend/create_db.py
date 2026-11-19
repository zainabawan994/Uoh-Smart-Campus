"""Create the PostgreSQL database (if missing) and all tables.

Usage (from the backend folder):  python create_db.py
Reads DATABASE_URL from .env. Safe to run more than once.
"""
import asyncio
import sys

import asyncpg
from sqlalchemy import inspect
from sqlalchemy.engine import make_url

from app.config import settings
from app.database import close_db, engine, init_db


async def ensure_database() -> None:
    url = make_url(settings.DATABASE_URL)
    db_name = url.database
    if not db_name or not db_name.replace("_", "").isalnum():
        sys.exit(f"Invalid database name in DATABASE_URL: {db_name!r}")

    # Connect to the default 'postgres' database to check / create the target one.
    conn = await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host or "localhost",
        port=url.port or 5432,
        database="postgres",
        timeout=10,
    )
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", db_name)
        if exists:
            print(f"Database '{db_name}' already exists.")
        else:
            await conn.execute(f'CREATE DATABASE "{db_name}" ENCODING \'UTF8\'')
            print(f"Created database '{db_name}'.")
    finally:
        await conn.close()


async def main() -> None:
    try:
        await ensure_database()
    except asyncpg.InvalidPasswordError:
        sys.exit("PostgreSQL rejected the username/password in DATABASE_URL (.env).")
    except OSError as exc:
        sys.exit(f"Could not reach PostgreSQL: {exc}")

    await init_db()
    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda c: inspect(c).get_table_names())
    await close_db()
    print(f"Tables ({len(tables)}): {', '.join(sorted(tables))}")


if __name__ == "__main__":
    asyncio.run(main())
