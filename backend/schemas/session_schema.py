"""
Session schema file.
This just means request/response data shapes for sessions go here.
"""

from datetime import datetime
from enum import IntEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SessionUsagePercent(IntEnum):
    """Allowed usage buckets selected for a study session."""

    zero = 0
    twenty_five = 25
    fifty = 50
    seventy_five = 75
    one_hundred = 100


class SessionCreate(BaseModel):
    """Input payload used when creating a study session."""

    location_id: UUID
    title: str
    max_participants: int = Field(gt=0)
    ends_at: datetime
    current_usage_percent: SessionUsagePercent = SessionUsagePercent.zero


class SessionUsageUpdate(BaseModel):
    """Input payload used when updating a session's current usage."""

    current_usage_percent: SessionUsagePercent


class SessionResponse(BaseModel):
    """Study session payload returned to clients."""

    id: UUID
    location_id: UUID
    creator_id: UUID
    title: str
    participants: int
    max_participants: int = Field(gt=0)
    created_at: datetime
    ends_at: datetime
    is_active: bool
    current_usage_percent: SessionUsagePercent
    public: bool

    model_config = ConfigDict(from_attributes=True)
