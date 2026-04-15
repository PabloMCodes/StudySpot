"""
Photo service for upload persistence and location photo aggregation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from models.location import Location
from models.session import PersonalStudySession
from models.session_photo import PhotoFeedback, SessionPhoto

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_RECENT_PHOTOS = 5
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads" / "session_photos"


def _sanitize_extension(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if suffix in ALLOWED_EXTENSIONS else ".jpg"


def save_upload_file(file: UploadFile) -> str:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    ext = _sanitize_extension(file.filename)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    target = UPLOADS_DIR / safe_name
    with target.open("wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    return f"/uploads/session_photos/{safe_name}"


def create_session_photo(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    image_url: str,
) -> SessionPhoto:
    session = db.get(PersonalStudySession, session_id)
    if session is None or session.user_id != user_id:
        raise ValueError("Session not found")
    photo = SessionPhoto(
        session_id=session_id,
        user_id=user_id,
        location_id=session.location_id,
        image_url=image_url,
    )
    db.add(photo)
    db.flush()
    return photo


def get_location_photos(db: Session, *, location_id: uuid.UUID) -> tuple[SessionPhoto | None, list[SessionPhoto]]:
    if db.get(Location, location_id) is None:
        raise ValueError("Location not found")

    recent_statement = (
        select(SessionPhoto)
        .where(SessionPhoto.location_id == location_id)
        .order_by(SessionPhoto.created_at.desc())
        .limit(MAX_RECENT_PHOTOS)
    )
    recent = list(db.scalars(recent_statement).all())

    most_helpful_statement = (
        select(SessionPhoto)
        .where(SessionPhoto.location_id == location_id)
        .order_by(SessionPhoto.helpful_count.desc(), SessionPhoto.created_at.desc())
        .limit(1)
    )
    most_helpful = db.scalar(most_helpful_statement)
    return most_helpful, recent


def like_photo(db: Session, *, photo_id: uuid.UUID, user_id: uuid.UUID) -> tuple[SessionPhoto, bool]:
    photo = db.get(SessionPhoto, photo_id)
    if photo is None:
        raise ValueError("Photo not found")

    existing = db.scalar(
        select(PhotoFeedback).where(PhotoFeedback.photo_id == photo_id, PhotoFeedback.user_id == user_id).limit(1)
    )
    if existing is not None:
        return photo, False

    feedback = PhotoFeedback(photo_id=photo_id, user_id=user_id)
    db.add(feedback)
    photo.helpful_count = int(photo.helpful_count) + 1
    db.flush()
    return photo, True
