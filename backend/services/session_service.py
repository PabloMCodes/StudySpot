"""
Session service file.
This means personal study-session business logic stays out of routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models.location import Location
from models.session import PersonalStudySession
from schemas.session_schema import (
    PersonalSessionEnd,
    PersonalSessionResponse,
    PersonalSessionsListResponse,
    PersonalSessionStart,
)
from services.distance_service import haversine_meters

SESSION_VALIDATION_RADIUS_METERS = 400
MAX_SESSION_HOURS = 24
SESSIONS_HISTORY_LIMIT = 100


@dataclass
class ServiceError(Exception):
    """Typed service error used by routes to map status codes."""

    status_code: int
    message: str


def _active_session_for_user(db: Session, *, user_id: uuid.UUID) -> PersonalStudySession | None:
    statement = (
        select(PersonalStudySession)
        .where(PersonalStudySession.user_id == user_id, PersonalStudySession.ended_at.is_(None))
        .order_by(PersonalStudySession.started_at.desc())
        .limit(1)
    )
    return db.scalar(statement)


def _auto_close_stale_sessions(db: Session, *, user_id: uuid.UUID, now_utc: datetime) -> None:
    stale_threshold = now_utc - timedelta(hours=MAX_SESSION_HOURS)
    statement = select(PersonalStudySession).where(
        PersonalStudySession.user_id == user_id,
        PersonalStudySession.ended_at.is_(None),
        PersonalStudySession.started_at <= stale_threshold,
    )
    stale_rows = list(db.scalars(statement).all())
    for row in stale_rows:
        row.ended_at = now_utc
        row.auto_timed_out = True

    if stale_rows:
        db.flush()


def start_personal_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: PersonalSessionStart,
) -> PersonalStudySession:
    """Start a personal study session, optionally tied to a verified location."""
    now_utc = datetime.now(timezone.utc)
    _auto_close_stale_sessions(db, user_id=user_id, now_utc=now_utc)

    if _active_session_for_user(db, user_id=user_id) is not None:
        raise ServiceError(status_code=409, message="You already have an active study session.")

    verified_location = False
    if payload.location_id is not None:
        location = db.get(Location, payload.location_id)
        if location is None:
            raise ServiceError(status_code=404, message="Location not found")
        if payload.lat is None or payload.lng is None:
            raise ServiceError(status_code=400, message="Location services must be enabled for location sessions.")
        distance_meters = haversine_meters(payload.lat, payload.lng, location.latitude, location.longitude)
        if distance_meters > SESSION_VALIDATION_RADIUS_METERS:
            raise ServiceError(status_code=400, message="You must be near this location to start this session.")
        verified_location = True

    start_note = payload.start_note.strip() if payload.start_note and payload.start_note.strip() else None
    session = PersonalStudySession(
        user_id=user_id,
        location_id=payload.location_id,
        topic=payload.topic.strip(),
        start_note=start_note,
        is_location_verified=verified_location,
        auto_timed_out=False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def end_personal_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    payload: PersonalSessionEnd,
) -> PersonalStudySession:
    """End an active personal session and save reflection fields."""
    now_utc = datetime.now(timezone.utc)
    _auto_close_stale_sessions(db, user_id=user_id, now_utc=now_utc)

    session = db.get(PersonalStudySession, payload.session_id)
    if session is None or session.user_id != user_id:
        raise ServiceError(status_code=404, message="Session not found")
    if session.ended_at is not None:
        raise ServiceError(status_code=400, message="Session is already ended")

    end_note = payload.end_note.strip() if payload.end_note and payload.end_note.strip() else None
    session.ended_at = now_utc
    session.accomplishment_score = payload.accomplishment_score
    session.end_note = end_note
    session.auto_timed_out = False
    db.commit()
    db.refresh(session)
    return session


def _to_response(session: PersonalStudySession) -> PersonalSessionResponse:
    location_name = session.location.name if session.location else None
    duration_minutes: int | None = None
    if session.ended_at is not None and not session.auto_timed_out:
        elapsed_seconds = max(0, int((session.ended_at - session.started_at).total_seconds()))
        duration_minutes = elapsed_seconds // 60

    return PersonalSessionResponse(
        id=session.id,
        location_id=session.location_id,
        location_name=location_name,
        topic=session.topic,
        start_note=session.start_note,
        accomplishment_score=session.accomplishment_score,
        end_note=session.end_note,
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_minutes=duration_minutes,
        is_active=session.ended_at is None,
        is_location_verified=session.is_location_verified,
        auto_timed_out=session.auto_timed_out,
    )


def get_my_personal_sessions(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> PersonalSessionsListResponse:
    """Return active personal session and history."""
    now_utc = datetime.now(timezone.utc)
    _auto_close_stale_sessions(db, user_id=user_id, now_utc=now_utc)
    db.commit()

    statement = (
        select(PersonalStudySession)
        .options(selectinload(PersonalStudySession.location))
        .where(PersonalStudySession.user_id == user_id)
        .order_by(PersonalStudySession.started_at.desc())
        .limit(SESSIONS_HISTORY_LIMIT)
    )
    rows = list(db.scalars(statement).all())
    active_row = next((row for row in rows if row.ended_at is None), None)
    history_rows = [row for row in rows if row.ended_at is not None]

    active_session = _to_response(active_row) if active_row is not None else None
    history = [_to_response(row) for row in history_rows]
    return PersonalSessionsListResponse(active_session=active_session, history=history)
