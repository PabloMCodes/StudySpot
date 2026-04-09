"""
Study session route file.
This just means endpoints for creating/joining sessions go here.
"""
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user
from models.user import User
from schemas.session_schema import SessionCreate, SessionResponse, SessionUsageUpdate
from services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _serialize_session(session) -> dict:
    participants = getattr(session, "participants", [])
    participant_count = participants if isinstance(participants, int) else len(participants or [])

    data = {
        "id": session.id,
        "location_id": session.location_id,
        "creator_id": session.creator_id,
        "title": session.title,
        "participants": participant_count,
        "max_participants": session.max_participants,
        "created_at": session.created_at,
        "ends_at": session.ends_at,
        "is_active": session.is_active,
        "current_usage_percent": session.current_usage_percent,
        "public": session.public,
    }
    return SessionResponse.model_validate(data).model_dump(mode="json")


@router.post("")
def create_session(payload: SessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        session = session_service.create_study_session(
            db,
            creator_id=current_user.id,
            location_id=payload.location_id,
            title=payload.title,
            max_participants=payload.max_participants,
            ends_at=payload.ends_at,
            current_usage_percent=int(payload.current_usage_percent),
            public=True,  # New sessions are public by default
        )
        data = _serialize_session(session)
        return {"success": True, "data": data, "error": None}
    
    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except ValueError as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to create session"})


@router.get("/me/active")
def get_my_active_session(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        session = session_service.get_active_study_session_for_user(
            db,
            user_id=current_user.id,
        )
        data = _serialize_session(session) if session is not None else None
        return {"success": True, "data": data, "error": None}

    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to fetch active session"})


@router.get("/{session_id}")
def get_session(session_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        session = session_service.get_study_session(
            db,
            session_id=session_id,
        )
        data = _serialize_session(session)
        return {"success": True, "data": data, "error": None}

    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to fetch session"})

@router.post("/{session_id}/join")
def join_session(session_id: uuid.UUID, payload: SessionUsageUpdate, db: Session = Depends(get_db), 
                current_user: User = Depends(get_current_user)):
    try:
        message = session_service.join_study_session(
            db,
            session_id=session_id,
            user_id=current_user.id,
            current_usage_percent=int(payload.current_usage_percent),
        )
        return {"success": True, "data": {"message": message}, "error": None}
    
    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except ValueError as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to join session"})

@router.post("/{session_id}/leave")
def leave_session(session_id: uuid.UUID, payload: SessionUsageUpdate, db: Session = Depends(get_db), 
                    current_user: User = Depends(get_current_user)):
    try:
        message = session_service.leave_study_session(
            db,
            session_id=session_id,
            user_id=current_user.id,
            current_usage_percent=int(payload.current_usage_percent),
        )
        return {"success": True, "data": {"message": message}, "error": None}
    
    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except ValueError as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to leave session"})


@router.patch("/{session_id}/usage")
def update_session_usage(session_id: uuid.UUID, payload: SessionUsageUpdate, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    try:
        session = session_service.update_session_usage_percent(
            db,
            session_id=session_id,
            user_id=current_user.id,
            current_usage_percent=int(payload.current_usage_percent),
        )
        data = _serialize_session(session)
        return {"success": True, "data": data, "error": None}
    
    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except ValueError as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to update session usage"})

@router.get("/session?location_id={location_id}")
def get_active_sessions_for_location(location_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        sessions = session_service.get_active_sessions_for_location(
            db,
            location_id=location_id,
        )
        data = [_serialize_session(session) for session in sessions]
        return {"success": True, "data": data, "error": None}
    
    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to fetch active sessions for location"})

@router.patch("/{session_id}/location/{location_id}")
def update_session_location(session_id: uuid.UUID, location_id: uuid.UUID, db: Session = Depends(get_db), 
                            current_user: User = Depends(get_current_user)):
    try:
        session = session_service.location_session(
            db, 
            session_id=session_id, 
            user_id=current_user.id, 
            location_id=location_id
        )
        data = _serialize_session(session)
        return {"success": True, "data": data, "error": None}
    except LookupError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except ValueError as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to update session location"})
