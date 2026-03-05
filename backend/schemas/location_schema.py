"""
Location schema file.
This just means request/response data shapes for locations go here.
"""

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
    name: str
    description: str | None = None
    comment_count: int = 0
    latitude: float
    longitude: float
    quiet_level: int = Field(ge=1, le=5)
    has_outlets: bool

    model_config = ConfigDict(from_attributes=True)
