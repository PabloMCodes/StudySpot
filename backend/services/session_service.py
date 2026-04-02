"""
Session service file.
This means session business logic lives here, not in routes.
"""
from __future__ import annotations
from datetime import datetime, timezone
import uuid
from sqlalchemy.orm import Session
from models.location import Location
from models.session import SessionParticipant, StudySession


def _normalize_future_datetime(value: datetime) -> datetime:
    """Ensure the provided datetime is in the future and timezone-aware."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)

    now = datetime.now(timezone.utc)
    if value <= now:
        raise ValueError("ends_at must be in the future")

    return value                # ask person in each one to estimate through the session and each one. LOCATION AND % OF FULL MANDATORY
                                # 

def create_study_session(db: Session,*,creator_id: uuid.UUID, location_id: uuid.UUID, title: str,
                        max_participants: int, ends_at: datetime) -> StudySession:
    
    location = db.get(Location, location_id)
    if location is None:
        raise LookupError("Location not found")

    normalized_ends_at = _normalize_future_datetime(ends_at)

    session = StudySession(location_id=location_id, creator_id=creator_id, title=title,
                            max_participants=max_participants, ends_at=normalized_ends_at)
    
    session.participants.append(SessionParticipant(user_id=creator_id))
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def join_study_session(db: Session,*,session_id: uuid.UUID,user_id: uuid.UUID) -> str:
    
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
    db.commit()
    return "Successfully joined the study session."


def leave_study_session(db: Session,*, session_id: uuid.UUID, user_id: uuid.UUID) -> str:
    
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
    db.commit()
    return "Successfully left the study session."

def location_session(db: Session, *, session_id: uuid.UUID, location_id: uuid.UUID) ->str:
    location = db.get(Location, location_id)
    
    
    