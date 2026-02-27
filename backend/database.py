"""
Database setup file.
This just means this file connects the app to Postgres and shares DB tools.
"""

from collections.abc import Generator
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/studyspot",
)

engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True)
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
