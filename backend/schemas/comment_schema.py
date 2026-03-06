"""
Comment schema file.
This just means request/response data shapes for comments go here.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CommentCreate(BaseModel):
    """Input payload used when creating a location comment."""

    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Comment text cannot be empty.")
        return text


class CommentResponse(BaseModel):
    """Comment payload returned by the API."""

    id: UUID
    user_id: UUID
    location_id: UUID
    text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
