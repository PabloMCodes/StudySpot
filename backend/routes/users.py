"""
User route file.
This just means user profile/account endpoints go here.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user, get_current_user_id
from models.user import User
from schemas.user_schema import UserPrivateProfileResponse, UserProfileResponse
from services import auth_service, session_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        profile = auth_service.get_user_profile_summary(
            db,
            user_id=current_user.id,
        )
        data = UserPrivateProfileResponse.model_validate(profile).model_dump(mode="json")
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch user profile"},
        )


@router.get("/{user_id}")
def get_user_profile(user_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        profile = auth_service.get_user_profile_summary(
            db,
            user_id=user_id,
        )
        data = UserProfileResponse.model_validate(profile).model_dump(
            mode="json",
            exclude={"email"},
        )
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch user profile"},
        )


@router.get("/me/profile-stats")
def get_my_profile_stats(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        data = session_service.get_user_profile_stats(db, user_id=current_user_id)
        return {"success": True, "data": data.model_dump(mode="json"), "error": None}
    except session_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch profile stats"},
        )


@router.get("/{user_id}/profile-stats")
def get_user_profile_stats(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        data = session_service.get_user_profile_stats(db, user_id=user_id)
        return {"success": True, "data": data.model_dump(mode="json", exclude={"email"}), "error": None}
    except session_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch profile stats"},
        )
