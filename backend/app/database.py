from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a session; commits on success, rolls back on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables automatically (idempotent). Call from the app lifespan."""
    from app import models  # noqa: F401  (registers models on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all does not add columns to existing tables. Keep this idempotent
        # compatibility migration until a full Alembic migration chain is introduced.
        await conn.execute(
            text("ALTER TABLE cafe_menu ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)")
        )
        await conn.execute(
            text("ALTER TABLE scraped_events ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000)")
        )


async def close_db() -> None:
    await engine.dispose()
