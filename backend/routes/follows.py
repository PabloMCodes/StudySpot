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
from services import follows_service

router = APIRouter(prefix="/users", tags=["friends"])


@router.post("/{user_id}/friend-request")
def send_friend_request(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        follows_service.send_friend_request(
            db,
            requester_id=current_user_id,
            target_user_id=user_id,
        )
        return {"success": True, "data": {"requested_user_id": str(user_id)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to send friend request"},
        )


@router.post("/{user_id}/friend-accept")
def accept_friend_request(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        follows_service.accept_friend_request(
            db,
            current_user_id=current_user_id,
            requester_id=user_id,
        )
        return {"success": True, "data": {"friend_user_id": str(user_id)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to accept friend request"},
        )


@router.delete("/{user_id}/friend-request")
def cancel_or_decline_friend_request(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        status = follows_service.get_relationship_status(
            db,
            current_user_id=current_user_id,
            other_user_id=user_id,
        )
        if status == "outgoing_request":
            follows_service.cancel_friend_request(
                db,
                requester_id=current_user_id,
                target_user_id=user_id,
            )
        elif status == "incoming_request":
            follows_service.decline_friend_request(
                db,
                current_user_id=current_user_id,
                requester_id=user_id,
            )
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "data": None, "error": "Friend request not found."},
            )
        return {"success": True, "data": {"user_id": str(user_id)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to update friend request"},
        )


@router.delete("/{user_id}/friend")
def remove_friend(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        follows_service.remove_friend(
            db,
            current_user_id=current_user_id,
            other_user_id=user_id,
        )
        return {"success": True, "data": {"removed_user_id": str(user_id)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to remove friend"},
        )


@router.get("/me/friends")
def get_my_friends(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        users = follows_service.get_friends(db, user_id=current_user_id)
        data = [FollowUserResponse.model_validate(u).model_dump(mode="json") for u in users]
        return {"success": True, "data": {"friends": data, "count": len(data)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch friends"},
        )


@router.get("/me/friend-requests/incoming")
def get_incoming_friend_requests(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        users = follows_service.get_pending_incoming_requests(db, user_id=current_user_id)
        data = [FollowUserResponse.model_validate(u).model_dump(mode="json") for u in users]
        return {"success": True, "data": {"incoming_requests": data, "count": len(data)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch incoming friend requests"},
        )


@router.get("/me/friend-requests/outgoing")
def get_outgoing_friend_requests(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        users = follows_service.get_pending_outgoing_requests(db, user_id=current_user_id)
        data = [FollowUserResponse.model_validate(u).model_dump(mode="json") for u in users]
        return {"success": True, "data": {"outgoing_requests": data, "count": len(data)}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch outgoing friend requests"},
        )


@router.get("/{user_id}/friend-status")
def get_friend_status(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        status = follows_service.get_relationship_status(
            db,
            current_user_id=current_user_id,
            other_user_id=user_id,
        )
        return {"success": True, "data": {"status": status}, "error": None}
    except follows_service.ServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch friend status"},
        )
