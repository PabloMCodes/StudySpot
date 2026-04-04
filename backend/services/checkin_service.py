"""
Check-in service file.
This means check-in business logic stays out of routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.checkin import CheckIn, CheckInStatus
from models.location import Location
from schemas.checkin_schema import (
    CheckInCreate,
    CheckInResponse,
    NearbyCheckInPromptResponse,
    OccupancyPercent,
)
from services import location_service
from services.distance_service import haversine_meters

CHECKIN_EXPIRATION_MINUTES = 90
CHECKIN_COOLDOWN_MINUTES = 30
CHECKIN_VALIDATION_RADIUS_METERS = 400
PROMPT_RADIUS_METERS = 300


@dataclass
class ServiceError(Exception):
    """Typed service error used by routes to map status codes."""

    status_code: int
    message: str


def occupancy_to_status(occupancy_percent: int | OccupancyPercent) -> CheckInStatus:
    """Convert occupancy bucket to existing check-in status enum."""
    value = int(occupancy_percent)
    if value <= 25:
        return CheckInStatus.plenty
    if value <= 50:
        return CheckInStatus.filling
    return CheckInStatus.packed


def status_to_occupancy(status: CheckInStatus) -> OccupancyPercent:
    """Convert persisted status enum back to occupancy bucket for API clients."""
    if status == CheckInStatus.plenty:
        return OccupancyPercent.twenty_five
    if status == CheckInStatus.filling:
        return OccupancyPercent.fifty
    return OccupancyPercent.seventy_five


def _last_checkin_for_location(
    db: Session,
    *,
    user_id: uuid.UUID,
    location_id: uuid.UUID,
) -> CheckIn | None:
    statement = (
        select(CheckIn)
        .where(CheckIn.user_id == user_id, CheckIn.location_id == location_id)
        .order_by(CheckIn.created_at.desc())
        .limit(1)
    )
    return db.scalar(statement)


def _get_nearest_location_within_radius(
    db: Session,
    *,
    lat: float,
    lng: float,
    radius_meters: float,
) -> tuple[Location | None, float | None]:
    locations = location_service.list_locations_filtered(
        db,
        lat=lat,
        lng=lng,
        radius_m=radius_meters,
        sort="distance",
        limit=1,
        offset=0,
    )
    if not locations:
        return None, None

    location = locations[0]
    distance_meters = haversine_meters(lat, lng, location.latitude, location.longitude)
    return location, distance_meters


def _cooldown_remaining_minutes(last_checkin_at: datetime, now_utc: datetime) -> int:
    cooldown_deadline = last_checkin_at + timedelta(minutes=CHECKIN_COOLDOWN_MINUTES)
    if now_utc >= cooldown_deadline:
        return 0
    seconds_remaining = int((cooldown_deadline - now_utc).total_seconds())
    return max(1, (seconds_remaining + 59) // 60)


def create_checkin(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: CheckInCreate,
) -> CheckIn:
    """Create a validated check-in with anti-spam cooldown and optional GPS guardrail."""
    location = db.get(Location, payload.location_id)
    if location is None:
        raise ServiceError(status_code=404, message="Location not found")

    now_utc = datetime.now(timezone.utc)
    last_checkin = _last_checkin_for_location(db, user_id=user_id, location_id=payload.location_id)
    if last_checkin is not None:
        remaining = _cooldown_remaining_minutes(last_checkin.created_at, now_utc)
        if remaining > 0:
            raise ServiceError(
                status_code=429,
                message=f"You already checked in here recently. Try again in {remaining} minute(s).",
            )

    if payload.lat is not None and payload.lng is not None:
        distance_meters = haversine_meters(payload.lat, payload.lng, location.latitude, location.longitude)
        if distance_meters > CHECKIN_VALIDATION_RADIUS_METERS:
            raise ServiceError(
                status_code=400,
                message="You must be near this location to check in.",
            )

    checkin = CheckIn(
        user_id=user_id,
        location_id=payload.location_id,
        status=occupancy_to_status(payload.occupancy_percent),
        expires_at=now_utc + timedelta(minutes=CHECKIN_EXPIRATION_MINUTES),
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return checkin


def build_checkin_response(checkin: CheckIn, *, requested_occupancy_percent: int | None = None) -> CheckInResponse:
    """Build API response schema without exposing raw ORM object."""
    occupancy_percent = (
        OccupancyPercent(requested_occupancy_percent)
        if requested_occupancy_percent is not None
        else status_to_occupancy(checkin.status)
    )
    return CheckInResponse(
        id=checkin.id,
        user_id=checkin.user_id,
        location_id=checkin.location_id,
        occupancy_percent=occupancy_percent,
        status=checkin.status.value,
        created_at=checkin.created_at,
        expires_at=checkin.expires_at,
    )


def get_nearby_checkin_prompt(
    db: Session,
    *,
    user_id: uuid.UUID,
    lat: float,
    lng: float,
) -> NearbyCheckInPromptResponse:
    """Return prompt decision for a user at a coordinate."""
    location, distance_meters = _get_nearest_location_within_radius(
        db,
        lat=lat,
        lng=lng,
        radius_meters=PROMPT_RADIUS_METERS,
    )
    if location is None:
        return NearbyCheckInPromptResponse(should_prompt=False)

    now_utc = datetime.now(timezone.utc)
    last_checkin = _last_checkin_for_location(db, user_id=user_id, location_id=location.id)
    if last_checkin is not None:
        remaining = _cooldown_remaining_minutes(last_checkin.created_at, now_utc)
        if remaining > 0:
            return NearbyCheckInPromptResponse(
                should_prompt=False,
                location_id=location.id,
                location_name=location.name,
                location_address=location.address,
                cooldown_remaining_minutes=remaining,
                distance_meters=distance_meters,
            )

    return NearbyCheckInPromptResponse(
        should_prompt=True,
        location_id=location.id,
        location_name=location.name,
        location_address=location.address,
        message=f"Studying at {location.name}? Make sure to check in!",
        distance_meters=distance_meters,
    )
