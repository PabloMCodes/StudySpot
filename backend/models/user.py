"""
User model file.
This just means this file defines what a user record looks like.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.checkin import CheckIn
    from models.comment import Comment
    from models.follow import Follow
    from models.session_photo import PhotoFeedback, SessionPhoto
    from models.session import SessionParticipant, StudySession
    from models.user_location import UserLocation


class User(Base):
    """User table class. This just means one row is one app user."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    google_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_picture: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    checkins: Mapped[list[CheckIn]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    created_sessions: Mapped[list[StudySession]] = relationship(
        back_populates="creator",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    session_participations: Mapped[list[SessionParticipant]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    saved_locations: Mapped[list[UserLocation]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    comments: Mapped[list[Comment]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Followers relationship.
    # This just means people who follow this user.
    followers: Mapped[list[Follow]] = relationship(
        back_populates="following_user",
        foreign_keys="Follow.following_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Following relationship.
    # This just means people this user follows.
    following: Mapped[list[Follow]] = relationship(
        back_populates="follower_user",
        foreign_keys="Follow.follower_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    session_photos: Mapped[list[SessionPhoto]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    photo_feedback: Mapped[list[PhotoFeedback]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
