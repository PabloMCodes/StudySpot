"""
Location schema file.
This just means request/response data shapes for locations go here.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    """Input payload for creating a study location (admin/seed usage)."""

    name: str
    description: str | None = None
    latitude: float
    longitude: float
    quiet_level: int = Field(ge=1, le=5)
    has_outlets: bool = False


class LocationResponse(BaseModel):
    """Standard location payload returned to clients."""

    id: UUID
    source_key: str
    name: str
    address: str | None = None
    description: str | None = None
    description_updated_at: datetime | None = None
    comment_count: int = 0
    latitude: float
    longitude: float
    category: str | None = None
    rating: float | None = None
    review_count: int | None = None
    open_time: str | None = None
    close_time: str | None = None
    hours: list[str] | dict[str, Any] | None = None
    price_level: int | None = None
    website: str | None = None
    phone: str | None = None
    maps_url: str | None = None
    editorial_summary: str | None = None
    types: list[str] | None = None
    quiet_level: int = Field(ge=1, le=5)
    has_outlets: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SavedLocationResponse(BaseModel):
    """Saved location entry returned for bookmark endpoints."""

    location: LocationResponse
    saved_at: datetime


class SavedLocationMutationResponse(BaseModel):
    """Bookmark mutation result returned after save/unsave actions."""

    location_id: UUID
    is_saved: bool
    saved_at: datetime | None = None


class LocationInteractionCreate(BaseModel):
    interaction_type: Literal["view", "click"]
