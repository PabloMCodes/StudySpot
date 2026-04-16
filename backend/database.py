"""
Database setup file.
This just means this file connects the app to Postgres and shares DB tools.
"""

from collections.abc import Generator
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool


def _load_env_defaults() -> None:
    """Load key=value pairs from backend/.env when shell vars are not exported."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_env_defaults()

def _normalize_database_url(raw_url: str) -> str:
    # Force SQLAlchemy to use psycopg v3 when DATABASE_URL is provided as postgresql:// or postgres://.
    if raw_url.startswith("postgresql+psycopg://"):
        return raw_url
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    return raw_url


DATABASE_URL = _normalize_database_url(
    os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/studyspot",
    )
)

IS_SERVERLESS = os.getenv("VERCEL") == "1"
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "1"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "0"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "10"))
CONNECT_ARGS: dict = {}

if "pooler.supabase.com" in DATABASE_URL:
    # Supabase transaction pooler is not compatible with server-side prepared statements.
    CONNECT_ARGS["prepare_threshold"] = None

if IS_SERVERLESS:
    # On serverless runtimes, avoid long-lived connection pools per function instance.
    engine = create_engine(
        DATABASE_URL,
        future=True,
        pool_pre_ping=True,
        poolclass=NullPool,
        connect_args=CONNECT_ARGS,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        future=True,
        pool_pre_ping=True,
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
        pool_timeout=DB_POOL_TIMEOUT,
        connect_args=CONNECT_ARGS,
    )
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared model base class. This just means all tables start from this."""



def get_db() -> Generator[Session, None, None]:
    """Request DB session helper. This just means open now, close after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
