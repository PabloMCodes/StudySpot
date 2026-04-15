"""
Session photo models.
This keeps session photo uploads and lightweight helpful feedback.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.location import Location
    from models.session import PersonalStudySession
    from models.user import User


class SessionPhoto(Base):
    __tablename__ = "session_photos"
    __table_args__ = (
        Index("ix_session_photos_location_id_created_at", "location_id", "created_at"),
        Index("ix_session_photos_helpful_created_at", "helpful_count", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("personal_study_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    image_url: Mapped[str] = mapped_column(nullable=False)
    helpful_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    session: Mapped[PersonalStudySession] = relationship(back_populates="photos")
    user: Mapped[User] = relationship(back_populates="session_photos")
    location: Mapped[Location | None] = relationship(back_populates="session_photos")
    feedback: Mapped[list[PhotoFeedback]] = relationship(
        back_populates="photo",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PhotoFeedback(Base):
    __tablename__ = "photo_feedback"
    __table_args__ = (
        UniqueConstraint("photo_id", "user_id", name="uq_photo_feedback_photo_user"),
        Index("ix_photo_feedback_photo_id", "photo_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    photo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_photos.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    photo: Mapped[SessionPhoto] = relationship(back_populates="feedback")
    user: Mapped[User] = relationship(back_populates="photo_feedback")
