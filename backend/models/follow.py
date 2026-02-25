"""Follow relationship model connecting one user to another."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.user import User


class Follow(Base):
    """Represents a directed follow edge between two users."""

    __tablename__ = "follows"
    __table_args__ = (
        CheckConstraint("follower_id <> following_id", name="ck_follows_not_self"),
        Index("ix_follows_follower_following", "follower_id", "following_id"),
    )

    follower_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    following_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    follower_user: Mapped[User] = relationship(
        back_populates="following",
        foreign_keys=[follower_id],
    )
    following_user: Mapped[User] = relationship(
        back_populates="followers",
        foreign_keys=[following_id],
    )
