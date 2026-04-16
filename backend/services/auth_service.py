"""
Auth service file.
This means all auth business logic lives here, not in routes.
"""

from __future__ import annotations
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import google.auth.transport.requests
import google.oauth2.id_token
from jose import jwt
from sqlalchemy import and_, exists, func, select
from sqlalchemy.orm import Session, aliased

from models.checkin import CheckIn
from models.comment import Comment
from models.follow import Follow
from models.location import Location
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


def _allowed_google_client_ids() -> set[str]:
    return {
        client_id
        for client_id in (GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID)
        if client_id
    }


# verification by google payload, returns id information
def verify_google_id_token(id_token: str) -> dict:
    request_session = google.auth.transport.requests.Request()
    try:
        # Verify signature/expiry first, then validate audience against allowed app client IDs.
        id_info = google.oauth2.id_token.verify_oauth2_token(id_token, request_session, None)
    except Exception as exc:
        raise ValueError(f"Invalid Google ID token: {exc}")

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
        db.commit()
        db.refresh(by_email)
        return by_email

    new_user = User(google_id=google_id, email=email, name=id_info.get("name"))
    db.add(new_user)
    db.commit()
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
