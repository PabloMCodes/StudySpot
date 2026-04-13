"""
Check-in service file.
This means check-in business logic stays out of routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models.checkin import CheckIn, CheckInStatus
from models.location import Location
from schemas.checkin_schema import (
    CrowdLabel,
    CheckInCreate,
    CheckInCheckout,
    CheckInResponse,
    CheckInSessionResponse,
    MyCheckInsResponse,
    NearbyCheckInPromptResponse,
)
from services import location_service
from services.distance_service import haversine_meters

CHECKIN_EXPIRATION_MINUTES = 90
CHECKIN_COOLDOWN_MINUTES = 30
CHECKIN_VALIDATION_RADIUS_METERS = 400
PROMPT_RADIUS_METERS = 300
MAX_CHECKIN_SESSION_HOURS = 24
CHECKIN_HISTORY_LIMIT = 100


@dataclass
class ServiceError(Exception):
    """Typed service error used by routes to map status codes."""

    status_code: int
    message: str


LABEL_TO_STATUS: dict[CrowdLabel, CheckInStatus] = {
    "empty": CheckInStatus.plenty,
    "available": CheckInStatus.plenty,
    "busy": CheckInStatus.filling,
    "packed": CheckInStatus.packed,
}

STATUS_TO_FALLBACK_LABEL: dict[CheckInStatus, CrowdLabel] = {
    CheckInStatus.plenty: "available",
    CheckInStatus.filling: "busy",
    CheckInStatus.packed: "packed",
}


def crowd_label_to_status(crowd_label: CrowdLabel) -> CheckInStatus:
    return LABEL_TO_STATUS[crowd_label]


def status_to_fallback_label(status: CheckInStatus) -> CrowdLabel:
    return STATUS_TO_FALLBACK_LABEL[status]


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


def _active_checkin_for_user(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> CheckIn | None:
    statement = (
        select(CheckIn)
        .where(CheckIn.user_id == user_id, CheckIn.checked_out_at.is_(None))
        .order_by(CheckIn.created_at.desc())
        .limit(1)
    )
    return db.scalar(statement)


def _mark_stale_open_checkins_as_timed_out(
    db: Session,
    *,
    user_id: uuid.UUID,
    now_utc: datetime,
) -> None:
    stale_threshold = now_utc - timedelta(hours=MAX_CHECKIN_SESSION_HOURS)
    statement = select(CheckIn).where(
        CheckIn.user_id == user_id,
        CheckIn.checked_out_at.is_(None),
        CheckIn.created_at <= stale_threshold,
    )
    stale_rows = list(db.scalars(statement).all())
    for row in stale_rows:
        row.checked_out_at = now_utc
        row.auto_timed_out = True

    if stale_rows:
        db.flush()


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
    """Create a validated check-in with anti-spam cooldown and required GPS guardrail."""
    location = db.get(Location, payload.location_id)
    if location is None:
        raise ServiceError(status_code=404, message="Location not found")

    now_utc = datetime.now(timezone.utc)
    _mark_stale_open_checkins_as_timed_out(db, user_id=user_id, now_utc=now_utc)

    active_checkin = _active_checkin_for_user(db, user_id=user_id)
    if active_checkin is not None:
        raise ServiceError(
            status_code=409,
            message="You already have an active check-in. Check out before checking in again.",
        )

    last_checkin = _last_checkin_for_location(db, user_id=user_id, location_id=payload.location_id)
    if last_checkin is not None:
        remaining = _cooldown_remaining_minutes(last_checkin.created_at, now_utc)
        if remaining > 0:
            raise ServiceError(
                status_code=429,
                message=f"You already checked in here recently. Try again in {remaining} minute(s).",
            )

    if payload.lat is None or payload.lng is None:
        raise ServiceError(
            status_code=400,
            message="Location services must be enabled to check in.",
        )

    distance_meters = haversine_meters(payload.lat, payload.lng, location.latitude, location.longitude)
    if distance_meters > CHECKIN_VALIDATION_RADIUS_METERS:
        raise ServiceError(
            status_code=400,
            message="You must be near this location to check in.",
        )

    checkin = CheckIn(
        user_id=user_id,
        location_id=payload.location_id,
        status=crowd_label_to_status(payload.crowd_label),
        crowd_label=payload.crowd_label,
        checkin_note=payload.study_note.strip() if payload.study_note and payload.study_note.strip() else None,
        expires_at=now_utc + timedelta(minutes=CHECKIN_EXPIRATION_MINUTES),
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return checkin


def checkout_checkin(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: CheckInCheckout,
) -> CheckIn:
    """Check out from an active check-in and store final occupancy + note."""
    now_utc = datetime.now(timezone.utc)
    _mark_stale_open_checkins_as_timed_out(db, user_id=user_id, now_utc=now_utc)

    checkin = db.get(CheckIn, payload.checkin_id)
    if checkin is None or checkin.user_id != user_id:
        raise ServiceError(status_code=404, message="Check-in not found")
    if checkin.checked_out_at is not None:
        raise ServiceError(status_code=400, message="This check-in is already checked out")

    if payload.lat is None or payload.lng is None:
        raise ServiceError(status_code=400, message="Location services must be enabled to check out.")

    location = db.get(Location, checkin.location_id)
    if location is None:
        raise ServiceError(status_code=404, message="Location not found")

    distance_meters = haversine_meters(payload.lat, payload.lng, location.latitude, location.longitude)
    if distance_meters > CHECKIN_VALIDATION_RADIUS_METERS:
        raise ServiceError(status_code=400, message="You must be near this location to check out.")

    note = payload.note.strip() if payload.note is not None else None
    checkin.checked_out_at = now_utc
    checkin.checkout_status = crowd_label_to_status(payload.crowd_label)
    checkin.checkout_crowd_label = payload.crowd_label
    checkin.checkout_note = note if note else None
    checkin.auto_timed_out = False
    db.commit()
    db.refresh(checkin)
    return checkin


def build_checkin_response(checkin: CheckIn, *, requested_crowd_label: CrowdLabel | None = None) -> CheckInResponse:
    """Build API response schema without exposing raw ORM object."""
    crowd_label = (
        requested_crowd_label
        if requested_crowd_label is not None
        else (checkin.crowd_label or status_to_fallback_label(checkin.status))
    )
    return CheckInResponse(
        id=checkin.id,
        user_id=checkin.user_id,
        location_id=checkin.location_id,
        crowd_label=crowd_label,
        status=checkin.status.value,
        created_at=checkin.created_at,
        expires_at=checkin.expires_at,
    )


def _build_checkin_session_response(checkin: CheckIn, *, now_utc: datetime) -> CheckInSessionResponse:
    checkout_label = (
        checkin.checkout_crowd_label
        or (status_to_fallback_label(checkin.checkout_status) if checkin.checkout_status is not None else None)
    )
    duration_minutes: int | None = None
    if checkin.checked_out_at is not None and not checkin.auto_timed_out:
        elapsed_seconds = max(0, int((checkin.checked_out_at - checkin.created_at).total_seconds()))
        duration_minutes = elapsed_seconds // 60

    location_name = checkin.location.name if checkin.location else "Unknown location"
    location_address = checkin.location.address if checkin.location else None
    return CheckInSessionResponse(
        id=checkin.id,
        location_id=checkin.location_id,
        location_name=location_name,
        location_address=location_address,
        checkin_crowd_label=checkin.crowd_label or status_to_fallback_label(checkin.status),
        checkout_crowd_label=checkout_label,
        study_note=checkin.checkin_note,
        checkout_note=checkin.checkout_note,
        checked_in_at=checkin.created_at,
        checked_out_at=checkin.checked_out_at,
        duration_minutes=duration_minutes,
        is_active=checkin.checked_out_at is None,
        auto_timed_out=checkin.auto_timed_out,
    )


def get_my_checkins(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> MyCheckInsResponse:
    """Return active check-in and recent history for the authenticated user."""
    now_utc = datetime.now(timezone.utc)
    _mark_stale_open_checkins_as_timed_out(db, user_id=user_id, now_utc=now_utc)
    db.commit()

    statement = (
        select(CheckIn)
        .options(selectinload(CheckIn.location))
        .where(CheckIn.user_id == user_id)
        .order_by(CheckIn.created_at.desc())
        .limit(CHECKIN_HISTORY_LIMIT)
    )
    rows = list(db.scalars(statement).all())
    active_checkin_row = next((row for row in rows if row.checked_out_at is None), None)
    history_rows = [row for row in rows if row.checked_out_at is not None]

    active_payload = (
        _build_checkin_session_response(active_checkin_row, now_utc=now_utc)
        if active_checkin_row is not None
        else None
    )
    history_payload = [
        _build_checkin_session_response(row, now_utc=now_utc)
        for row in history_rows
    ]
    return MyCheckInsResponse(active_checkin=active_payload, history=history_payload)


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
