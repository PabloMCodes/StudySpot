"""
Check-in schema file.
This just means request/response data shapes for check-ins go here.
"""

from datetime import datetime
from enum import IntEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OccupancyPercent(IntEnum):
    """Allowed occupancy buckets selected by users."""

    zero = 0
    twenty_five = 25
    fifty = 50
    seventy_five = 75
    one_hundred = 100


class CheckInCreate(BaseModel):
    """Input payload used when creating a check-in."""

    location_id: UUID
    occupancy_percent: OccupancyPercent
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class CheckInResponse(BaseModel):
    """Check-in payload returned by the API."""

    id: UUID
    user_id: UUID
    location_id: UUID
    occupancy_percent: OccupancyPercent
    status: str
    created_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CheckInCheckout(BaseModel):
    """Input payload used when checking out from an active check-in."""

    checkin_id: UUID
    occupancy_percent: OccupancyPercent
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    note: str | None = None


class CheckInSessionResponse(BaseModel):
    """User-facing check-in session payload with location metadata."""

    id: UUID
    location_id: UUID
    location_name: str
    location_address: str | None = None
    checkin_occupancy_percent: OccupancyPercent
    checkout_occupancy_percent: OccupancyPercent | None = None
    note: str | None = None
    checked_in_at: datetime
    checked_out_at: datetime | None = None
    duration_minutes: int | None = None
    is_active: bool
    auto_timed_out: bool


class MyCheckInsResponse(BaseModel):
    """Payload returned by /checkins/me."""

    active_checkin: CheckInSessionResponse | None
    history: list[CheckInSessionResponse]
    occupancy_options: list[OccupancyPercent]


class NearbyCheckInPromptRequest(BaseModel):
    """Input payload used to evaluate whether a nearby prompt should be shown."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class NearbyCheckInPromptResponse(BaseModel):
    """Prompt payload returned when user is near a location."""

    should_prompt: bool
    occupancy_options: list[OccupancyPercent]
    location_id: UUID | None = None
    location_name: str | None = None
    location_address: str | None = None
    message: str | None = None
    distance_meters: float | None = None
    cooldown_remaining_minutes: int | None = None
