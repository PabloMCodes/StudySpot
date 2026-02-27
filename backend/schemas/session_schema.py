"""
Session schema file.
This just means request/response data shapes for sessions go here.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SessionCreate(BaseModel):
    """Input payload used when creating a study session."""

    location_id: UUID
    title: str
    max_participants: int = Field(gt=0)
    ends_at: datetime


class SessionResponse(BaseModel):
    """Study session payload returned to clients."""

    id: UUID
    location_id: UUID
    creator_id: UUID
    title: str
    max_participants: int = Field(gt=0)
    created_at: datetime
    ends_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
