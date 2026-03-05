"""
Shared auth helper file.
This just means login-check helpers are kept in one reusable place.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from services import auth_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google", auto_error=True)
optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/google",
    auto_error=False,
)


def _credentials_error() -> HTTPException:
    """Standard 401 error for invalid or missing bearer credentials."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode_token(token: str) -> dict[str, Any]:
    """Decode JWT and return payload dict."""
    if not auth_service.JWT_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT configuration is missing",
        )

    try:
        payload = jwt.decode(
            token,
            auth_service.JWT_SECRET_KEY,
            algorithms=[auth_service.JWT_ALGORITHM],
        )
    except JWTError:
        raise _credentials_error()

    if not isinstance(payload, dict):
        raise _credentials_error()

    return payload


def _get_user_from_payload(db: Session, payload: dict[str, Any]) -> User:
    """Resolve user from token payload `sub` claim."""
    sub = payload.get("sub")
    if not sub:
        raise _credentials_error()

    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise _credentials_error()

    user = db.get(User, user_id)
    if user is None:
        raise _credentials_error()

    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Required auth dependency."""
    payload = _decode_token(token=token)
    return _get_user_from_payload(db=db, payload=payload)


def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Optional auth dependency; returns None when bearer token is absent."""
    if not token:
        return None

    payload = _decode_token(token=token)
    return _get_user_from_payload(db=db, payload=payload)


def get_current_user_id(current_user: User = Depends(get_current_user)) -> uuid.UUID:
    """Convenience dependency for routes that only need authenticated user id."""
    return current_user.id
