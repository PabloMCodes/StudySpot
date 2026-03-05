"""
Shared auth helper file.
This just means login-check helpers are kept in one reusable place.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status


def get_current_user_id() -> uuid.UUID:
    """
    TODO(auth owner): implement Bearer JWT parsing and return authenticated user UUID.

    Context for this placeholder:
    - `POST /locations/{location_id}/comments` (in `routes/comments.py`) was built to call
      `comment_service.create_location_comment(...)`.
    - That service needs a `user_id`, so this dependency is where auth should provide it.
    - When auth wiring is ready, this function should extract `sub` from JWT and return UUID.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Auth dependency not implemented",
    )
