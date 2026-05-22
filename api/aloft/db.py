"""
SQLAlchemy async engine + session factory.

Prisma owns the schema (see ../web/prisma/schema.prisma). This module exposes
read/write access for FastAPI handlers and background scripts. We mirror the
Prisma table names in models.py and trust Prisma's migrations to keep them in
sync.
"""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from aloft.config import get_settings


def _make_async_url(url: str) -> str:
    """
    Prisma writes `postgresql://...` with libpq-style params (sslmode,
    channel_binding). We use SQLAlchemy + psycopg's async driver because it
    accepts those params natively; asyncpg would need them stripped and
    translated, which gets fiddly with Neon's required SSL.
    """
    if not url:
        return url
    if url.startswith("postgresql+psycopg://") or url.startswith("postgresql+psycopg_async://"):
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    return url


settings = get_settings()
# Use the direct URL for SQLAlchemy — pooled URLs run through PgBouncer in
# transaction mode, which breaks server-side cursors / prepared statements.
_engine_url = _make_async_url(settings.direct_database_url or settings.database_url)

engine = (
    create_async_engine(_engine_url, pool_pre_ping=True, future=True)
    if _engine_url
    else None
)
SessionLocal = (
    async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    if engine is not None
    else None
)


async def get_session() -> AsyncIterator[AsyncSession]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    async with SessionLocal() as session:
        yield session
