"""
Check-in model file.
This just means this file stores quick crowd updates from users.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.location import Location
    from models.user import User


class CheckInStatus(str, PyEnum):
    """Status choices. This just means users pick one crowd level word."""

    plenty = "plenty"
    filling = "filling"
    packed = "packed"


class CheckIn(Base):
    """Check-in table class. This just means one row is one crowd report."""

    __tablename__ = "checkins"
    __table_args__ = (Index("ix_checkins_created_at", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[CheckInStatus] = mapped_column(
        Enum(CheckInStatus, name="checkin_status", native_enum=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(back_populates="checkins")
    location: Mapped[Location] = relationship(back_populates="checkins")
