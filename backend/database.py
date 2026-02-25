"""SQLAlchemy database primitives for declarative models and sessions."""

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
    """Base declarative class for all ORM models."""



def get_db() -> Generator[Session, None, None]:
    """Yield a DB session for request-scoped dependencies."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
