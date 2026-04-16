"""
Photo schemas for upload/display/feedback payloads.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PhotoUploadResponse(BaseModel):
    image_url: str


class SessionPhotoResponse(BaseModel):
    id: UUID
    session_id: UUID
    location_id: UUID | None
    image_url: str
    helpful_count: int
    created_at: datetime


class LocationPhotosResponse(BaseModel):
    most_helpful: SessionPhotoResponse | None
    recent_photos: list[SessionPhotoResponse]
