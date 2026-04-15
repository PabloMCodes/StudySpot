"""
Session service file.
This means session business logic lives here, not in routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models.location import Location
from models.session import PersonalStudySession, SessionParticipant, StudySession
from schemas.session_schema import (
    PersonalSessionComplete,
    PersonalSessionEnd,
    PersonalSessionResponse,
    PersonalSessionsListResponse,
    PersonalSessionStart,
)
from services import photo_service
from services.distance_service import haversine_meters

SESSION_VALIDATION_RADIUS_METERS = 400
MAX_SESSION_HOURS = 24
SESSIONS_HISTORY_LIMIT = 100


@dataclass
class ServiceError(Exception):
    """Typed service error used by routes to map status codes."""

    status_code: int
    message: str


# Personal session logic

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
    ordered_photo_urls = [
        photo.image_url
        for photo in sorted(session.photos, key=lambda item: item.created_at, reverse=True)
    ] if session.photos else []
    latest_photo_url = ordered_photo_urls[0] if ordered_photo_urls else None
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
        rating=session.rating,
        focus_level=session.focus_level,
        end_note=session.end_note,
        photo_url=latest_photo_url,
        photo_urls=ordered_photo_urls,
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
        .options(
            selectinload(PersonalStudySession.location),
            selectinload(PersonalStudySession.photos),
        )
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


def complete_personal_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: PersonalSessionComplete,
) -> PersonalStudySession:
    """
    End a personal session with optional rating/focus/note/photo.
    All fields are optional to keep the completion flow fast.
    """
    now_utc = datetime.now(timezone.utc)
    _auto_close_stale_sessions(db, user_id=user_id, now_utc=now_utc)

    session = db.get(PersonalStudySession, session_id)
    if session is None or session.user_id != user_id:
        raise ServiceError(status_code=404, message="Session not found")
    if session.ended_at is not None:
        raise ServiceError(status_code=400, message="Session is already ended")

    session.ended_at = now_utc
    session.rating = payload.rating if payload.rating is not None else session.rating
    session.focus_level = payload.focus_level if payload.focus_level is not None else session.focus_level
    session.accomplishment_score = (
        payload.accomplishment_score
        if payload.accomplishment_score is not None
        else session.accomplishment_score
    )
    note = payload.note.strip() if payload.note else None
    session.end_note = note if note else session.end_note
    session.auto_timed_out = False

    if payload.image_url:
        photo_service.create_session_photo(
            db,
            session_id=session.id,
            user_id=user_id,
            image_url=payload.image_url,
        )

    db.commit()
    db.refresh(session)
    return session


# Group session logic

def _normalize_future_datetime(value: datetime) -> datetime:
    """Ensure the provided datetime is in the future and timezone-aware."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)

    now = datetime.now(timezone.utc)
    if value <= now:
        raise ValueError("ends_at must be in the future")

    return value


def create_study_session(
    db: Session,
    *,
    creator_id: uuid.UUID,
    location_id: uuid.UUID,
    title: str,
    max_participants: int,
    ends_at: datetime,
    current_usage_percent: int = 0,
    public: bool = True,
) -> StudySession:
    location = db.get(Location, location_id)
    if location is None:
        raise LookupError("Location not found")

    normalized_ends_at = _normalize_future_datetime(ends_at)

    session = StudySession(
        location_id=location_id,
        creator_id=creator_id,
        title=title,
        max_participants=max_participants,
        ends_at=normalized_ends_at,
        current_usage_percent=int(current_usage_percent),
        public=public,
    )

    session.participants.append(SessionParticipant(user_id=creator_id))

    db.add(session)
    db.commit()
    db.refresh(session)

    return session


def get_study_session(db: Session, *, session_id: uuid.UUID) -> StudySession:
    """Fetch a study session by id."""
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Study session not found")

    return session


def get_active_study_session_for_user(db: Session, *, user_id: uuid.UUID) -> StudySession | None:
    """Fetch the most recently created active study session for a participant."""
    statement = (
        select(StudySession)
        .join(SessionParticipant, SessionParticipant.session_id == StudySession.id)
        .where(
            SessionParticipant.user_id == user_id,
            StudySession.is_active.is_(True),
        )
        .order_by(StudySession.created_at.desc())
        .limit(1)
    )
    return db.execute(statement).scalar_one_or_none()


def join_study_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    current_usage_percent: int,
) -> str:
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Study session not found")

    already_participant = any(participant.user_id == user_id for participant in session.participants)

    if already_participant:
        raise ValueError("You are already a participant in this session")

    if len(session.participants) >= session.max_participants:
        raise ValueError("Cannot join session, max participants reached")

    if not session.is_active:
        raise ValueError("Session is not active")

    session.participants.append(SessionParticipant(user_id=user_id))
    session.current_usage_percent = int(current_usage_percent)
    db.commit()
    return "Successfully joined the study session."


def leave_study_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    current_usage_percent: int,
) -> str:
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Study session not found")

    if session.creator_id == user_id:
        db.delete(session)
        db.commit()
        return "Session deleted because the creator left."

    participant = next((entry for entry in session.participants if entry.user_id == user_id), None)

    if participant is None:
        raise ValueError("You are not a participant in this session")

    session.participants.remove(participant)
    session.current_usage_percent = int(current_usage_percent)
    db.commit()
    return "Successfully left the study session."


def update_session_usage_percent(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    current_usage_percent: int,
) -> StudySession:
    """Update the live usage value for an active session."""
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Study session not found")

    is_participant = any(participant.user_id == user_id for participant in session.participants)
    if not is_participant:
        raise ValueError("Only session participants can update the current usage")

    if not session.is_active:
        raise ValueError("Session is not active")

    session.current_usage_percent = int(current_usage_percent)
    db.commit()
    db.refresh(session)
    return session


def get_active_sessions_for_location(db: Session, *, location_id: uuid.UUID) -> list[StudySession]:
    """Fetch all active study sessions for a given location."""
    statement = (
        select(StudySession)
        .where(
            StudySession.location_id == location_id,
            StudySession.is_active.is_(True),
            StudySession.ends_at > datetime.now(timezone.utc),
        )
        .order_by(StudySession.created_at.desc())
    )
    return db.execute(statement).scalars().all()


def location_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    location_id: uuid.UUID,
) -> StudySession:
    """Update the location assigned to a study session."""
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Study session not found")

    if session.creator_id != user_id:
        raise ValueError("Only the session creator can change the location")

    location = db.get(Location, location_id)
    if location is None:
        raise LookupError("Location not found")

    session.location_id = location_id
    db.commit()
    db.refresh(session)
    return session
