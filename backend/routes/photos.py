"""
Photo routes for upload and helpful feedback.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user
from models.user import User
from schemas.photo_schema import PhotoUploadResponse, SessionPhotoResponse
from services import photo_service

router = APIRouter(prefix="/photos", tags=["photos"])


@router.post("/upload")
def upload_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        image_url = photo_service.save_upload_file(file)
        if not image_url.startswith("http://") and not image_url.startswith("https://"):
            image_url = str(request.base_url).rstrip("/") + image_url
        payload = PhotoUploadResponse(image_url=image_url)
        return {"success": True, "data": payload.model_dump(mode="json"), "error": None}
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to upload photo"},
        )


@router.post("/{photo_id}/like")
def like_photo(
    photo_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        photo, created = photo_service.like_photo(db, photo_id=photo_id, user_id=current_user.id)
        db.commit()
        db.refresh(photo)
        data = {
            "created": created,
            "photo": SessionPhotoResponse(
                id=photo.id,
                session_id=photo.session_id,
                location_id=photo.location_id,
                image_url=photo.image_url,
                helpful_count=photo.helpful_count,
                created_at=photo.created_at,
            ).model_dump(mode="json"),
        }
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        db.rollback()
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to like photo"},
        )
