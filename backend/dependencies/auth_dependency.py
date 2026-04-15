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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google", auto_error=True) # may need to fix for auth/login , ask pablo
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google", auto_error=False) # same comment as above

### Standard 401 error for invalid or missing bearer credentials
def credentials_error() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,  
                        detail= {"success" : False, "data" : None, "error" : "Could not validate credentials"},
                        )

### Decode JWT & return payload dictionary (payload)
def decode_token(token: str) -> dict[str, Any]:
    if not auth_service.JWT_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"success": False, "data" : None, "error" : "JWT configuration is missing (JWT_SECRET_KEY)"},
        )
    try:
        payload = jwt.decode(token, auth_service.JWT_SECRET_KEY, algorithms=[auth_service.JWT_ALGORITHM])
    except JWTError:
        raise credentials_error() 

    if not isinstance(payload, dict):
        raise credentials_error() ###### if credential is not of dict type raise error

    return payload

# Sub is bearer's token. See if sub is in payload. If user in database returns user
def get_user_from_payload(db: Session, payload: dict[str, Any]) -> User:
    sub = payload.get("sub")
    if not sub:
        raise credentials_error()
    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise credentials_error()

    user = db.get(User, user_id)
    if user is None:
        raise credentials_error()

    return user

## returns user, REQUIRED AUTHENTICATION DEPENDENCY
## if not token = fails
def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)) -> User:
    payload = decode_token(token=token)
    return get_user_from_payload(db=db, payload=payload)

## returns token when present, returns none when not -- OPTIONAL AUTHENTICATION DEPENDENCY
## for log users and guest (that is why the token is optional)
def get_optional_current_user(token: str | None = Depends(optional_oauth2_scheme), db = Depends(get_db)) -> User | None:
    if not token:
        return None
    payload = decode_token(token=token)
    return get_user_from_payload(db=db, payload=payload)

## Dependency to routes for only verification for user id 
def get_current_user_id(current_user: User = Depends(get_current_user)) -> uuid.UUID:
    return current_user.id
