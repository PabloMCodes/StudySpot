"""
Session service file.
This means session business logic lives here, not in routes.
"""
from __future__ import annotations
from datetime import datetime, timezone
import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session
from models.location import Location
from models.session import SessionParticipant, StudySession


# this is code to normalize the datetime to ensure it's in the future and timezone-aware.
def _normalize_future_datetime(value: datetime) -> datetime:
    """Ensure the provided datetime is in the future and timezone-aware."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)

    now = datetime.now(timezone.utc)
    if value <= now:
        raise ValueError("ends_at must be in the future")

    return value                # ask person in each one to estimate through the session and each one. 

# this creates a session and adds the creator as a participant. It also checks if the location exists and if the ends_at is valid.
def create_study_session(db: Session, *, creator_id: uuid.UUID, location_id: uuid.UUID, title: str, max_participants: int, ends_at: datetime,
                        current_usage_percent: int = 0, public: bool = True) -> StudySession:
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

# thus is the code to join a session. It checks if the session exists, if the user is already a participant, if the session is full, and if the session is active. 
# If all checks pass, it adds the user as a participant and commits the change to the database.
def join_study_session(db: Session,*,session_id: uuid.UUID,user_id: uuid.UUID, current_usage_percent: int) -> str:
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

# this is the code to leave a session. If the user is the creator, it deletes the session. If the user is a participant, 
# it removes them from the session. If the user is not a participant, it raises an error
def leave_study_session(db: Session,*, session_id: uuid.UUID, user_id: uuid.UUID, current_usage_percent: int) -> str:
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Study session not found")

    if session.creator_id == user_id:
        db.delete(session)
        db.commit()
        return "Session deleted because the creator left."

    participant = next((entry for entry in session.participants if entry.user_id == user_id))
    
    if participant is None:
        raise ValueError("You are not a participant in this session")

    session.participants.remove(participant)
    session.current_usage_percent = int(current_usage_percent)
    db.commit()
    return "Successfully left the study session."


def update_session_usage_percent(db: Session,*, session_id: uuid.UUID, user_id: uuid.UUID, current_usage_percent: int) -> StudySession:
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

def location_session(db: Session, *, session_id: uuid.UUID, user_id: uuid.UUID, location_id: uuid.UUID) -> StudySession:
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
