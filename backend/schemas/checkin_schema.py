"""
Check-in schema file.
This just means request/response data shapes for check-ins go here.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

CrowdLabel = Literal["empty", "available", "busy", "packed"]


class CheckInCreate(BaseModel):
    """Input payload used when creating a check-in."""

    location_id: UUID
    crowd_label: CrowdLabel
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    study_note: str | None = None


class CheckInResponse(BaseModel):
    """Check-in payload returned by the API."""

    id: UUID
    user_id: UUID
    location_id: UUID
    crowd_label: CrowdLabel
    status: str
    created_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CheckInCheckout(BaseModel):
    """Input payload used when checking out from an active check-in."""

    checkin_id: UUID
    crowd_label: CrowdLabel
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    note: str | None = None


class CheckInSessionResponse(BaseModel):
    """User-facing check-in session payload with location metadata."""

    id: UUID
    location_id: UUID
    location_name: str
    location_address: str | None = None
    checkin_crowd_label: CrowdLabel
    checkout_crowd_label: CrowdLabel | None = None
    study_note: str | None = None
    checkout_note: str | None = None
    checked_in_at: datetime
    checked_out_at: datetime | None = None
    duration_minutes: int | None = None
    is_active: bool
    auto_timed_out: bool


class MyCheckInsResponse(BaseModel):
    """Payload returned by /checkins/me."""

    active_checkin: CheckInSessionResponse | None
    history: list[CheckInSessionResponse]


class NearbyCheckInPromptRequest(BaseModel):
    """Input payload used to evaluate whether a nearby prompt should be shown."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class NearbyCheckInPromptResponse(BaseModel):
    """Prompt payload returned when user is near a location."""

    should_prompt: bool
    location_id: UUID | None = None
    location_name: str | None = None
    location_address: str | None = None
    message: str | None = None
    distance_meters: float | None = None
    cooldown_remaining_minutes: int | None = None
