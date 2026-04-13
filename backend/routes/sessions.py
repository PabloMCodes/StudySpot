"""
Study session route file.
This just means endpoints for creating/joining sessions go here.
"""

import traceback

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user
from models.user import User
from schemas.session_schema import PersonalSessionEnd, PersonalSessionStart
from services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/me")
def get_my_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        payload = session_service.get_my_personal_sessions(
            db,
            user_id=current_user.id,
        )
        return {"success": True, "data": payload.model_dump(mode="json"), "error": None}
    except Exception:
        db.rollback()
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch sessions"},
        )


@router.post("/start")
def start_session(
    payload: PersonalSessionStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        session = session_service.start_personal_session(
            db,
            user_id=current_user.id,
            payload=payload,
        )
        sessions_payload = session_service.get_my_personal_sessions(
            db,
            user_id=current_user.id,
        )
        return {
            "success": True,
            "data": {
                "session_id": str(session.id),
                "active_session": sessions_payload.active_session.model_dump(mode="json")
                if sessions_payload.active_session
                else None,
            },
            "error": None,
        }
    except session_service.ServiceError as exc:
        db.rollback()
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to start session"},
        )


@router.post("/end")
def end_session(
    payload: PersonalSessionEnd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        session_service.end_personal_session(
            db,
            user_id=current_user.id,
            payload=payload,
        )
        sessions_payload = session_service.get_my_personal_sessions(
            db,
            user_id=current_user.id,
        )
        return {"success": True, "data": sessions_payload.model_dump(mode="json"), "error": None}
    except session_service.ServiceError as exc:
        db.rollback()
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to end session"},
        )
