"""
Comment route file.
This just means endpoints for creating location comments go here.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user_id
from schemas.comment_schema import CommentCreate, CommentResponse
from services import comment_service

router = APIRouter(prefix="/locations", tags=["comments"])


@router.post("/{location_id}/comments")
def create_comment_for_location(
    location_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    try:
        comment = comment_service.create_location_comment(
            db,
            user_id=user_id,
            location_id=location_id,
            text=payload.text,
        )
        data = CommentResponse.model_validate(comment).model_dump()
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to create comment"},
        )
