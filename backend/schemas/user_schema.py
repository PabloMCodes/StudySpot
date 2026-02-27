"""
User schema file.
This just means request/response data shapes for users go here.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    """Public user shape returned in standard user responses."""

    id: UUID
    email: str
    name: str | None = None
    profile_picture: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPrivateResponse(BaseModel):
    """Private user shape returned by authenticated /me-style endpoints."""

    id: UUID
    email: str
    name: str | None = None
    profile_picture: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
