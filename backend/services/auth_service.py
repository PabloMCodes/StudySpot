"""
Auth service file.
This means all auth business logic lives here, not in routes.
"""

from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone

import google.auth.transport.requests
import google.oauth2.id_token
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.user import User

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

def authenticate_google_user(db: Session, id_token: str) -> dict[str, str]:
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")
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

# verification by google payload, returns id information
def verify_google_id_token(id_token: str) -> dict:
    request_session = google.auth.transport.requests.Request()
    try:
        id_info = google.oauth2.id_token.verify_oauth2_token(id_token, request_session, GOOGLE_CLIENT_ID)
    except Exception as exc:
        raise ValueError({"Invalid Google ID token" : exc})

    if id_info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"): 
        raise ValueError("Invalid Google token issuer") ##### "iss" is who issue token 

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
