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
