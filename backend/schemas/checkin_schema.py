"""
Check-in schema file.
This just means request/response data shapes for check-ins go here.
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CheckInStatus(str, Enum):
    """Allowed crowd-status values for check-in submissions."""

    plenty = "plenty"
    filling = "filling"
    packed = "packed"


class CheckInCreate(BaseModel):
    """Input payload used when creating a check-in."""

    location_id: UUID
    status: CheckInStatus


class CheckInResponse(BaseModel):
    """Check-in payload returned by the API."""

    id: UUID
    user_id: UUID
    location_id: UUID
    status: CheckInStatus
    created_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)
