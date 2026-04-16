"""
Session service file.
This means session business logic lives here, not in routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import Date, Float, Integer, and_, cast, func, select
from sqlalchemy.orm import Session, selectinload

from models.follow import Follow
from models.location import Location
from models.session_photo import SessionPhoto
from models.session import PersonalStudySession, SessionParticipant, StudySession
from models.user import User
from schemas.session_schema import (
    FollowingLeaderboardEntryResponse,
    PersonalSessionComplete,
    PersonalSessionEnd,
    PersonalSessionHistoryUpdate,
    PersonalSessionResponse,
    PersonalSessionsListResponse,
    PersonalSessionStart,
)
from schemas.user_schema import (
    MostStudiedLocationResponse,
    ProfileStatsResponse,
    RecentStudyPhotoResponse,
)
from services import photo_service
from services.distance_service import haversine_meters

SESSION_VALIDATION_RADIUS_METERS = 400
MAX_SESSION_HOURS = 24
SESSIONS_HISTORY_LIMIT = 100
LEADERBOARD_WINDOW_DAYS = 7


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


def update_personal_session_history(
    db: Session,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: PersonalSessionHistoryUpdate,
) -> PersonalStudySession:
    """Update editable fields for an ended personal study session."""
    session = db.get(PersonalStudySession, session_id)
    if session is None or session.user_id != user_id:
        raise ServiceError(status_code=404, message="Session not found")
    if session.ended_at is None:
        raise ServiceError(status_code=400, message="Active sessions cannot be edited")

    if payload.topic is not None:
        topic = payload.topic.strip()
        if not topic:
            raise ServiceError(status_code=400, message="Topic cannot be empty")
        session.topic = topic
    if payload.start_note is not None:
        note = payload.start_note.strip()
        session.start_note = note if note else None
    if payload.end_note is not None:
        note = payload.end_note.strip()
        session.end_note = note if note else None
    if payload.rating is not None:
        session.rating = payload.rating
    if payload.focus_level is not None:
        session.focus_level = payload.focus_level
    if payload.accomplishment_score is not None:
        session.accomplishment_score = payload.accomplishment_score

    remove_photo_urls = [
        url.strip()
        for url in payload.remove_photo_urls
        if isinstance(url, str) and url.strip()
    ]
    if remove_photo_urls:
        delete_statement = select(SessionPhoto).where(
            SessionPhoto.session_id == session.id,
            SessionPhoto.user_id == user_id,
            SessionPhoto.image_url.in_(remove_photo_urls),
        )
        for photo in db.scalars(delete_statement).all():
            db.delete(photo)

    add_photo_urls = [
        url.strip()
        for url in payload.add_photo_urls
        if isinstance(url, str) and url.strip()
    ]
    if add_photo_urls:
        existing_urls = set(
            db.scalars(
                select(SessionPhoto.image_url).where(
                    SessionPhoto.session_id == session.id,
                    SessionPhoto.user_id == user_id,
                )
            ).all()
        )
        for image_url in add_photo_urls:
            if image_url in existing_urls:
                continue
            photo_service.create_session_photo(
                db,
                session_id=session.id,
                user_id=user_id,
                image_url=image_url,
            )
            existing_urls.add(image_url)

    db.commit()
    db.refresh(session)
    return session


def delete_personal_session_history(
    db: Session,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> None:
    """Delete an ended personal study session from history."""
    session = db.get(PersonalStudySession, session_id)
    if session is None or session.user_id != user_id:
        raise ServiceError(status_code=404, message="Session not found")
    if session.ended_at is None:
        raise ServiceError(status_code=400, message="Active sessions cannot be deleted")

    db.delete(session)
    db.commit()


def get_following_leaderboard(
    db: Session,
    *,
    current_user_id: uuid.UUID,
) -> list[FollowingLeaderboardEntryResponse]:
    """Rank followed users by completed personal-study minutes in the last 7 days."""
    window_start = datetime.now(timezone.utc) - timedelta(days=LEADERBOARD_WINDOW_DAYS)
    total_minutes_expr = cast(
        func.floor(
            func.coalesce(
                func.sum(
                    func.extract(
                        "epoch",
                        PersonalStudySession.ended_at - PersonalStudySession.started_at,
                    )
                ),
                0.0,
            )
            / 60.0
        ),
        Integer,
    )

    statement = (
        select(
            User.id.label("user_id"),
            User.name.label("name"),
            total_minutes_expr.label("total_study_time"),
        )
        .select_from(Follow)
        .join(User, User.id == Follow.following_id)
        .outerjoin(
            PersonalStudySession,
            and_(
                PersonalStudySession.user_id == Follow.following_id,
                PersonalStudySession.ended_at.is_not(None),
                PersonalStudySession.auto_timed_out.is_(False),
                PersonalStudySession.ended_at >= window_start,
            ),
        )
        .where(Follow.follower_id == current_user_id)
        .group_by(User.id, User.name)
        .order_by(total_minutes_expr.desc(), User.name.asc().nulls_last(), User.id.asc())
    )
    rows = db.execute(statement).all()

    self_statement = (
        select(
            User.id.label("user_id"),
            User.name.label("name"),
            cast(
                func.floor(
                    func.coalesce(
                        func.sum(
                            func.extract(
                                "epoch",
                                PersonalStudySession.ended_at - PersonalStudySession.started_at,
                            )
                        ),
                        0.0,
                    )
                    / 60.0
                ),
                Integer,
            ).label("total_study_time"),
        )
        .select_from(User)
        .outerjoin(
            PersonalStudySession,
            and_(
                PersonalStudySession.user_id == User.id,
                PersonalStudySession.ended_at.is_not(None),
                PersonalStudySession.auto_timed_out.is_(False),
                PersonalStudySession.ended_at >= window_start,
            ),
        )
        .where(User.id == current_user_id)
        .group_by(User.id, User.name)
    )
    self_row = db.execute(self_statement).one_or_none()

    combined_rows = list(rows)
    if self_row is not None and all(row.user_id != self_row.user_id for row in combined_rows):
        combined_rows.append(self_row)

    sorted_rows = sorted(
        combined_rows,
        key=lambda row: (
            -(int(row.total_study_time or 0)),
            (row.name or "").lower(),
            str(row.user_id),
        ),
    )

    leaderboard: list[FollowingLeaderboardEntryResponse] = []
    for idx, row in enumerate(sorted_rows, start=1):
        leaderboard.append(
            FollowingLeaderboardEntryResponse(
                user_id=row.user_id,
                name=row.name,
                total_study_time=int(row.total_study_time or 0),
                rank=idx,
            )
        )
    return leaderboard


def get_user_profile_stats(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> ProfileStatsResponse:
    """Build profile stats for a user from existing personal study sessions."""
    user = db.get(User, user_id)
    if user is None:
        raise ServiceError(status_code=404, message="User not found.")

    now_utc = datetime.now(timezone.utc)
    window_start = now_utc - timedelta(days=LEADERBOARD_WINDOW_DAYS)
    completed_filter = and_(
        PersonalStudySession.ended_at.is_not(None),
        PersonalStudySession.auto_timed_out.is_(False),
    )
    duration_minutes_expr = (
        func.extract(
            "epoch",
            PersonalStudySession.ended_at - PersonalStudySession.started_at,
        )
        / 60.0
    )

    aggregate_statement = (
        select(
            cast(
                func.coalesce(
                    func.floor(func.sum(duration_minutes_expr).filter(completed_filter)),
                    0,
                ),
                Integer,
            ).label("total_study_time"),
            cast(
                func.coalesce(
                    func.floor(
                        func.sum(duration_minutes_expr).filter(
                            and_(
                                completed_filter,
                                PersonalStudySession.ended_at >= window_start,
                            )
                        )
                    ),
                    0,
                ),
                Integer,
            ).label("study_time_last_7_days"),
            func.count(PersonalStudySession.id).filter(completed_filter).label("total_sessions"),
            func.count(func.distinct(PersonalStudySession.location_id))
            .filter(
                and_(
                    completed_filter,
                    PersonalStudySession.location_id.is_not(None),
                )
            )
            .label("unique_locations"),
            func.avg(cast(PersonalStudySession.focus_level, Float))
            .filter(
                and_(
                    completed_filter,
                    PersonalStudySession.focus_level.is_not(None),
                )
            )
            .label("average_focus_level"),
        )
        .where(PersonalStudySession.user_id == user_id)
    )
    aggregate = db.execute(aggregate_statement).one()

    location_minutes_expr = cast(func.floor(func.sum(duration_minutes_expr)), Integer)
    most_studied_statement = (
        select(
            Location.id.label("id"),
            Location.name.label("name"),
            location_minutes_expr.label("total_study_time"),
        )
        .join(Location, Location.id == PersonalStudySession.location_id)
        .where(
            PersonalStudySession.user_id == user_id,
            PersonalStudySession.location_id.is_not(None),
            PersonalStudySession.ended_at.is_not(None),
            PersonalStudySession.auto_timed_out.is_(False),
        )
        .group_by(Location.id, Location.name)
        .order_by(location_minutes_expr.desc(), Location.name.asc())
        .limit(1)
    )
    most_studied = db.execute(most_studied_statement).one_or_none()

    study_day_expr = cast(func.date(PersonalStudySession.ended_at), Date)
    study_days_statement = (
        select(study_day_expr)
        .where(
            PersonalStudySession.user_id == user_id,
            PersonalStudySession.ended_at.is_not(None),
            PersonalStudySession.auto_timed_out.is_(False),
        )
        .group_by(study_day_expr)
        .order_by(study_day_expr.desc())
    )
    study_days = {row[0] for row in db.execute(study_days_statement).all() if row[0] is not None}
    today = now_utc.date()
    start_day = today if today in study_days else (today - timedelta(days=1))
    current_streak = 0
    while start_day in study_days:
        current_streak += 1
        start_day -= timedelta(days=1)

    photos_statement = (
        select(SessionPhoto.image_url, SessionPhoto.created_at)
        .where(SessionPhoto.user_id == user_id)
        .order_by(SessionPhoto.created_at.desc())
        .limit(3)
    )
    recent_photos = [
        RecentStudyPhotoResponse(image_url=row.image_url, created_at=row.created_at)
        for row in db.execute(photos_statement).all()
    ]

    most_studied_location = (
        MostStudiedLocationResponse(
            id=most_studied.id,
            name=most_studied.name,
            total_study_time=int(most_studied.total_study_time or 0),
        )
        if most_studied
        else None
    )

    average_focus = float(aggregate.average_focus_level) if aggregate.average_focus_level is not None else None
    if average_focus is not None:
        average_focus = round(average_focus, 2)

    return ProfileStatsResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        profile_picture=user.profile_picture,
        total_study_time=int(aggregate.total_study_time or 0),
        study_time_last_7_days=int(aggregate.study_time_last_7_days or 0),
        total_sessions=int(aggregate.total_sessions or 0),
        unique_locations=int(aggregate.unique_locations or 0),
        most_studied_location=most_studied_location,
        average_focus_level=average_focus,
        current_streak_days=current_streak,
        recent_photos=recent_photos,
    )


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


def _expire_study_session_if_needed(
    db: Session,
    *,
    session: StudySession,
    now_utc: datetime | None = None,
) -> bool:
    """Mark a group study session inactive once its scheduled end time has passed."""
    now_utc = now_utc or datetime.now(timezone.utc)
    if not session.is_active or session.ends_at > now_utc:
        return False

    session.is_active = False
    db.commit()
    db.refresh(session)
    return True


def _expire_user_study_sessions(
    db: Session,
    *,
    user_id: uuid.UUID,
    now_utc: datetime | None = None,
) -> None:
    """Close expired group sessions for a user before returning active-session views."""
    now_utc = now_utc or datetime.now(timezone.utc)
    statement = (
        select(StudySession)
        .join(SessionParticipant, SessionParticipant.session_id == StudySession.id)
        .where(
            SessionParticipant.user_id == user_id,
            StudySession.is_active.is_(True),
            StudySession.ends_at <= now_utc,
        )
    )
    expired_sessions = list(db.execute(statement).scalars().all())
    if not expired_sessions:
        return

    for session in expired_sessions:
        session.is_active = False

    db.commit()


def _expire_location_study_sessions(db: Session,*,location_id: uuid.UUID, now_utc: datetime | None = None) -> None:
    """Close expired group sessions for a location before listing active sessions."""
    now_utc = now_utc or datetime.now(timezone.utc)
    statement = (
        select(StudySession)
        .where(
            StudySession.location_id == location_id,
            StudySession.is_active.is_(True),
            StudySession.ends_at <= now_utc,
        )
    )
    expired_sessions = list(db.execute(statement).scalars().all())
    if not expired_sessions:
        return

    for session in expired_sessions:
        session.is_active = False

    db.commit()


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

    _expire_study_session_if_needed(db, session=session)
    return session


def get_active_study_session_for_user(db: Session, *, user_id: uuid.UUID) -> StudySession | None:
    """Fetch the most recently created active study session for a participant."""
    now_utc = datetime.now(timezone.utc)
    _expire_user_study_sessions(db, user_id=user_id, now_utc=now_utc)

    statement = (
        select(StudySession)
        .join(SessionParticipant, SessionParticipant.session_id == StudySession.id)
        .where(
            SessionParticipant.user_id == user_id,
            StudySession.is_active.is_(True),
            StudySession.ends_at > now_utc,
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
    if _expire_study_session_if_needed(db, session=session):
        raise ValueError("Session is not active")

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
    if _expire_study_session_if_needed(db, session=session):
        raise ValueError("Session is not active")

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
    now_utc = datetime.now(timezone.utc)
    _expire_location_study_sessions(db, location_id=location_id, now_utc=now_utc)

    statement = (
        select(StudySession)
        .where(
            StudySession.location_id == location_id,
            StudySession.is_active.is_(True),
            StudySession.ends_at > now_utc,
            StudySession.creator_id.isnot(None),
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
    if _expire_study_session_if_needed(db, session=session):
        raise ValueError("Session is not active")

    if session.creator_id != user_id:
        raise ValueError("Only the session creator can change the location")

    location = db.get(Location, location_id)
    if location is None:
        raise LookupError("Location not found")

    session.location_id = location_id
    db.commit()
    db.refresh(session)
    return session
