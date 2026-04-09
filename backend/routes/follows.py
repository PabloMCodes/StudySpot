"""
Follow route file.
This just means follow/unfollow endpoints go here.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user_id
from schemas.user_schema import FollowUserResponse
from services import follow_service

router = APIRouter(prefix="/users", tags=["follows"])


@router.post("/{user_id}/follow")
def follow_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        follow_service.follow_user(
            db,
            follower_id=current_user_id,
            following_id=user_id,
        )
        return {"success": True, "data": {"following_id": str(user_id)}, "error": None}
    except follow_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to follow user"},
        )


@router.delete("/{user_id}/follow")
def unfollow_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        follow_service.unfollow_user(
            db,
            follower_id=current_user_id,
            following_id=user_id,
        )
        return {"success": True, "data": {"unfollowed_id": str(user_id)}, "error": None}
    except follow_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to unfollow user"},
        )


@router.get("/{user_id}/followers")
def get_followers(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        users = follow_service.get_followers(db, user_id=user_id)
        data = [FollowUserResponse.model_validate(u).model_dump() for u in users]
        return {"success": True, "data": {"followers": data, "count": len(data)}, "error": None}
    except follow_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch followers"},
        )


@router.get("/{user_id}/following")
def get_following(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        users = follow_service.get_following(db, user_id=user_id)
        data = [FollowUserResponse.model_validate(u).model_dump() for u in users]
        return {"success": True, "data": {"following": data, "count": len(data)}, "error": None}
    except follow_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch following"},
        )