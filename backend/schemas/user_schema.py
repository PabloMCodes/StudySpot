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


class UserVisitedLocationResponse(BaseModel):
    """Top location entry shown on a user's profile."""

    location_id: UUID
    name: str
    visit_count: int


class UserStudyTopicResponse(BaseModel):
    """Top study topic entry shown on a user's profile."""

    topic: str
    session_count: int


class UserProfileResponse(BaseModel):
    """Public user profile summary."""

    id: UUID
    name: str | None = None
    profile_picture: str | None = None
    created_at: datetime
    total_checkins: int
    follower_count: int
    following_count: int
    saved_locations_count: int
    total_comments: int
    most_visited_locations: list[UserVisitedLocationResponse]
    most_studied_topics: list[UserStudyTopicResponse]


class UserPrivateProfileResponse(UserProfileResponse):
    """Private user profile summary for the authenticated owner."""

    email: str


class FollowUserResponse(BaseModel):
    """User shape returned in follower/following list responses."""

    id: UUID
    name: str | None = None
    profile_picture: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MostStudiedLocationResponse(BaseModel):
    id: UUID
    name: str
    total_study_time: int


class RecentStudyPhotoResponse(BaseModel):
    image_url: str
    created_at: datetime


class ProfileStatsResponse(BaseModel):
    id: UUID
    name: str | None = None
    email: str
    profile_picture: str | None = None
    total_study_time: int
    study_time_last_7_days: int
    total_sessions: int
    unique_locations: int
    most_studied_location: MostStudiedLocationResponse | None = None
    average_focus_level: float | None = None
    current_streak_days: int
    recent_photos: list[RecentStudyPhotoResponse] = []
