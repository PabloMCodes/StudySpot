"""
Auth service file.
This means all auth business logic lives here, not in routes.
"""

from __future__ import annotations
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import google.auth.transport.requests
import google.oauth2.id_token
import httpx
from jose import jwt
from sqlalchemy import and_, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from models.checkin import CheckIn
from models.comment import Comment
from models.follow import Follow
from models.location import Location
from models.session_photo import SessionPhoto
from models.session import PersonalStudySession
from models.user_location import UserLocation
from models.user import User


def _load_env_defaults() -> None:
    """Load key=value pairs from backend/.env when shell vars are not exported."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_env_defaults()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_IOS_CLIENT_ID = os.getenv("GOOGLE_IOS_CLIENT_ID", "")
GOOGLE_ANDROID_CLIENT_ID = os.getenv("GOOGLE_ANDROID_CLIENT_ID", "")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "session-photos")

def authenticate_google_user(db: Session, id_token: str) -> dict[str, str]:
    if not _allowed_google_client_ids():
        raise ValueError("Google OAuth client IDs are not configured")
    if not JWT_SECRET_KEY:
        raise ValueError("JWT_SECRET_KEY is not configured")

    id_info = verify_google_id_token(id_token=id_token)
    google_id = id_info.get("sub")
    email = id_info.get("email")
    
    if not google_id or not email:
        raise ValueError("Invalid Google token payload")

    user = get_or_create_google_user(db=db, id_info=id_info)
    access_token = create_jwt_for_user(user_id=str(user.id))

    return {"access_token": access_token, "token_type": "bearer"}


def authenticate_supabase_user(db: Session, access_token: str) -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise ValueError("Supabase credentials are not configured")
    if not JWT_SECRET_KEY:
        raise ValueError("JWT_SECRET_KEY is not configured")

    user_payload = verify_supabase_access_token(access_token=access_token)
    user = get_or_create_supabase_user(db=db, user_payload=user_payload)
    app_token = create_jwt_for_user(user_id=str(user.id))
    return {"access_token": app_token, "token_type": "bearer"}


def _allowed_google_client_ids() -> set[str]:
    return {
        client_id
        for client_id in (GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID)
        if client_id
    }


def verify_supabase_access_token(access_token: str) -> dict:
    url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {access_token}",
    }

    try:
        response = httpx.get(url, headers=headers, timeout=10.0)
    except Exception:
        raise ValueError("Authentication provider is unavailable")

    if response.status_code != 200:
        raise ValueError("Invalid Supabase access token")

    data = response.json()
    if not data.get("id") or not data.get("email"):
        raise ValueError("Invalid Supabase token payload")

    return data


# verification by google payload, returns id information
def verify_google_id_token(id_token: str) -> dict:
    request_session = google.auth.transport.requests.Request()
    try:
        # Verify signature/expiry first, then validate audience against allowed app client IDs.
        id_info = google.oauth2.id_token.verify_oauth2_token(id_token, request_session, None)
    except Exception:
        raise ValueError("Invalid Google ID token")

    if id_info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"): 
        raise ValueError("Invalid Google token issuer") ##### "iss" is who issue token 

    audience = id_info.get("aud")
    if audience not in _allowed_google_client_ids():
        raise ValueError("Google token audience is not allowed for this backend")

    return id_info

# resolve use google claim (existing account, existing email, creation of new user)
def get_or_create_google_user(db: Session, id_info: dict) -> User:
    google_id = id_info["sub"]
    email = id_info["email"]

    user = db.scalar(select(User).where(User.google_id == google_id))
    if user:
        user.name = id_info.get("name")
        user.profile_picture = id_info.get("picture")
        db.commit()
        db.refresh(user)
        return user

    # Fallback: same email existed before Google ID was linked
    by_email = db.scalar(select(User).where(User.email == email))
    if by_email:
        by_email.google_id = google_id
        by_email.name = id_info.get("name")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(User).where(User.google_id == google_id))
            if existing:
                return existing
            raise
        db.refresh(by_email)
        return by_email

    new_user = User(google_id=google_id, email=email, name=id_info.get("name"))
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(User).where((User.google_id == google_id) | (User.email == email))
        )
        if existing:
            return existing
        raise
    db.refresh(new_user)
    return new_user


def get_or_create_supabase_user(db: Session, user_payload: dict) -> User:
    supabase_id = user_payload["id"]
    email = user_payload["email"]
    provider_key = f"supabase:{supabase_id}"

    user = db.scalar(select(User).where(User.google_id == provider_key))
    if user:
        metadata = user_payload.get("user_metadata") or {}
        user.name = metadata.get("name") or user.name
        db.commit()
        db.refresh(user)
        return user

    by_email = db.scalar(select(User).where(User.email == email))
    if by_email:
        metadata = user_payload.get("user_metadata") or {}
        by_email.name = metadata.get("name") or by_email.name
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(User).where(User.email == email))
            if existing:
                return existing
            raise
        db.refresh(by_email)
        return by_email

    metadata = user_payload.get("user_metadata") or {}
    new_user = User(
        google_id=provider_key,
        email=email,
        name=metadata.get("name"),
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(User).where((User.google_id == provider_key) | (User.email == email))
        )
        if existing:
            return existing
        raise
    db.refresh(new_user)
    return new_user

# creation of sub (token that the Bearer is assigned) and expiration (JWT short live security)
def create_jwt_for_user(user_id: str):
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_user_profile_summary(db: Session, *, user_id: uuid.UUID) -> dict:
    """Build a profile summary with aggregate counts and lightweight highlights."""
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("User not found")

    total_checkins = db.scalar(
        select(func.count(CheckIn.id)).where(CheckIn.user_id == user_id)
    ) or 0
    reverse_follow = aliased(Follow)
    reverse_for_incoming = aliased(Follow)
    reverse_for_outgoing = aliased(Follow)
    friend_count = db.scalar(
        select(func.count())
        .select_from(Follow)
        .join(
            reverse_follow,
            and_(
                reverse_follow.follower_id == Follow.following_id,
                reverse_follow.following_id == user_id,
            ),
        )
        .where(Follow.follower_id == user_id)
    ) or 0
    incoming_request_count = db.scalar(
        select(func.count())
        .select_from(Follow)
        .where(
            Follow.following_id == user_id,
            ~exists(
                select(reverse_for_incoming.follower_id).where(
                    reverse_for_incoming.follower_id == user_id,
                    reverse_for_incoming.following_id == Follow.follower_id,
                )
            ),
        )
    ) or 0
    outgoing_request_count = db.scalar(
        select(func.count())
        .select_from(Follow)
        .where(
            Follow.follower_id == user_id,
            ~exists(
                select(reverse_for_outgoing.follower_id).where(
                    reverse_for_outgoing.follower_id == Follow.following_id,
                    reverse_for_outgoing.following_id == user_id,
                )
            ),
        )
    ) or 0
    saved_locations_count = db.scalar(
        select(func.count()).select_from(UserLocation).where(UserLocation.user_id == user_id)
    ) or 0
    total_comments = db.scalar(
        select(func.count()).select_from(Comment).where(Comment.user_id == user_id)
    ) or 0

    most_visited_rows = db.execute(
        select(
            Location.id.label("location_id"),
            Location.name.label("name"),
            func.count(CheckIn.id).label("visit_count"),
        )
        .join(CheckIn, CheckIn.location_id == Location.id)
        .where(CheckIn.user_id == user_id)
        .group_by(Location.id, Location.name)
        .order_by(func.count(CheckIn.id).desc(), Location.name.asc())
        .limit(3)
    ).all()

    most_studied_topic_rows = db.execute(
        select(
            PersonalStudySession.topic.label("topic"),
            func.count(PersonalStudySession.id).label("session_count"),
        )
        .where(
            PersonalStudySession.user_id == user_id,
            PersonalStudySession.topic.is_not(None),
            PersonalStudySession.topic != "",
        )
        .group_by(PersonalStudySession.topic)
        .order_by(func.count(PersonalStudySession.id).desc(), PersonalStudySession.topic.asc())
        .limit(3)
    ).all()

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "profile_picture": user.profile_picture,
        "created_at": user.created_at,
        "total_checkins": int(total_checkins),
        "friend_count": int(friend_count),
        "incoming_request_count": int(incoming_request_count),
        "outgoing_request_count": int(outgoing_request_count),
        "saved_locations_count": int(saved_locations_count),
        "total_comments": int(total_comments),
        "most_visited_locations": [
            {
                "location_id": row.location_id,
                "name": row.name,
                "visit_count": int(row.visit_count),
            }
            for row in most_visited_rows
        ],
        "most_studied_topics": [
            {
                "topic": row.topic,
                "session_count": int(row.session_count),
            }
            for row in most_studied_topic_rows
        ],
    }


def delete_user_account(db: Session, *, user: User) -> None:
    """Delete the authenticated user and cascade related domain data."""
    _cleanup_user_uploaded_photos(db, user_id=user.id)
    db.delete(user)
    db.commit()


def _extract_supabase_object_key(image_url: str) -> str | None:
    if not SUPABASE_URL:
        return None
    parsed_url = urlparse(image_url)
    parsed_supabase_url = urlparse(SUPABASE_URL)
    if parsed_url.netloc != parsed_supabase_url.netloc:
        return None
    public_prefix = f"/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/"
    if not parsed_url.path.startswith(public_prefix):
        return None
    return unquote(parsed_url.path.removeprefix(public_prefix))


def _delete_supabase_object(object_key: str) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    object_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{quote(object_key)}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    try:
        response = httpx.delete(object_url, headers=headers, timeout=10.0)
        if response.status_code not in (200, 204, 404):
            response.raise_for_status()
    except Exception:
        pass


def _cleanup_user_uploaded_photos(db: Session, *, user_id: uuid.UUID) -> None:
    upload_dir = Path(__file__).resolve().parent.parent / "uploads" / "session_photos"
    image_urls = list(
        db.scalars(select(SessionPhoto.image_url).where(SessionPhoto.user_id == user_id)).all()
    )

    for image_url in image_urls:
        parsed_url = urlparse(image_url)
        normalized_path = parsed_url.path if parsed_url.scheme else image_url
        if "/uploads/session_photos/" in normalized_path:
            filename = Path(normalized_path).name
            if filename:
                local_photo_path = upload_dir / filename
                try:
                    local_photo_path.unlink(missing_ok=True)
                except Exception:
                    pass

        object_key = _extract_supabase_object_key(image_url)
        if object_key:
            _delete_supabase_object(object_key)
