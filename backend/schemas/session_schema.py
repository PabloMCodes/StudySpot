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


class PersonalSessionStart(BaseModel):
    """Start a personal study session."""

    topic: str = Field(min_length=1, max_length=200)
    location_id: UUID | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    start_note: str | None = None


class PersonalSessionEnd(BaseModel):
    """End a personal study session."""

    session_id: UUID
    accomplishment_score: int = Field(ge=1, le=10)
    end_note: str | None = None


class PersonalSessionComplete(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    focus_level: int | None = Field(default=None, ge=1, le=4)
    accomplishment_score: int | None = Field(default=None, ge=1, le=10)
    note: str | None = None
    image_url: str | None = None


class PersonalSessionHistoryUpdate(BaseModel):
    topic: str | None = Field(default=None, min_length=1, max_length=200)
    start_note: str | None = None
    end_note: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    focus_level: int | None = Field(default=None, ge=1, le=4)
    accomplishment_score: int | None = Field(default=None, ge=1, le=10)
    add_photo_urls: list[str] = []
    remove_photo_urls: list[str] = []


class PersonalSessionResponse(BaseModel):
    """Personal session response payload."""

    id: UUID
    location_id: UUID | None = None
    location_name: str | None = None
    topic: str
    start_note: str | None = None
    accomplishment_score: int | None = None
    rating: int | None = None
    focus_level: int | None = None
    end_note: str | None = None
    photo_url: str | None = None
    photo_urls: list[str] = []
    started_at: datetime
    ended_at: datetime | None = None
    duration_minutes: int | None = None
    is_active: bool
    is_location_verified: bool
    auto_timed_out: bool


class PersonalSessionsListResponse(BaseModel):
    """Personal sessions list payload for /sessions/me."""

    active_session: PersonalSessionResponse | None
    history: list[PersonalSessionResponse]


class LeaderboardEntryResponse(BaseModel):
    """Leaderboard row ranked by recent study time."""

    user_id: UUID
    name: str | None = None
    total_study_time: int = Field(ge=0)
    rank: int = Field(ge=1)
