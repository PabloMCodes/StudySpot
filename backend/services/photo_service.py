"""
Photo service for upload persistence and location photo aggregation.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import UploadFile
import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from models.location import Location
from models.session import PersonalStudySession
from models.session_photo import PhotoFeedback, SessionPhoto

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_RECENT_PHOTOS = 5
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads" / "session_photos"
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "session-photos")


def _sanitize_extension(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if suffix in ALLOWED_EXTENSIONS else ".jpg"


def _supabase_headers(content_type: str) -> dict[str, str]:
    auth_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    return {
        "apikey": auth_key,
        "Authorization": f"Bearer {auth_key}",
        "Content-Type": content_type,
        "x-upsert": "false",
    }


def _build_supabase_public_url(object_key: str) -> str:
    encoded_object_key = quote(object_key)
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{encoded_object_key}"


def _upload_to_supabase_storage(file: UploadFile, safe_name: str) -> str:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise ValueError("Supabase storage credentials are not configured")

    object_key = f"session_photos/{safe_name}"
    upload_url = (
        f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{quote(object_key)}"
    )
    body = file.file.read()
    if not body:
        raise ValueError("Empty upload file")

    content_type = file.content_type or "image/jpeg"
    response = httpx.post(
        upload_url,
        headers=_supabase_headers(content_type),
        content=body,
        timeout=30.0,
    )
    if response.status_code >= 400:
        raise ValueError("Failed to upload image to Supabase storage")

    return _build_supabase_public_url(object_key)


def save_upload_file(file: UploadFile) -> str:
    ext = _sanitize_extension(file.filename)
    safe_name = f"{uuid.uuid4().hex}{ext}"

    if SUPABASE_URL and SUPABASE_ANON_KEY:
        return _upload_to_supabase_storage(file, safe_name)

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
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
