"""
Comment service file.
This means comment business logic lives here, not in routes.
"""

from __future__ import annotations

import uuid

from sqlalchemy import update
from sqlalchemy.orm import Session

from models.comment import Comment
from models.location import Location
from models.user import User


def create_location_comment(
    db: Session,
    *,
    user_id: uuid.UUID,
    location_id: uuid.UUID,
    text: str,
) -> Comment:
    """Create a comment and increment the target location comment counter."""
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("User not found")

    location = db.get(Location, location_id)
    if location is None:
        raise ValueError("Location not found")

    comment = Comment(user_id=user_id, location_id=location_id, text=text)
    db.add(comment)

    db.execute(
        update(Location)
        .where(Location.id == location_id)
        .values(comment_count=Location.comment_count + 1)
    )

    db.commit()
    db.refresh(comment)
    return comment
