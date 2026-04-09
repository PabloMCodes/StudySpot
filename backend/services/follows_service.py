"""
Follow service file.
This means follow/unfollow business logic stays out of routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.follow import Follow
from models.user import User


@dataclass
class ServiceError(Exception):
    """Typed service error used by routes to map status codes."""

    status_code: int
    message: str


def follow_user(
    db: Session,
    *,
    follower_id: uuid.UUID,
    following_id: uuid.UUID,
) -> Follow:
    """Follow a user. Raises ServiceError on self-follow or duplicate."""
    if follower_id == following_id:
        raise ServiceError(status_code=400, message="You cannot follow yourself.")

    target = db.get(User, following_id)
    if target is None:
        raise ServiceError(status_code=404, message="User not found.")

    existing = db.get(Follow, {"follower_id": follower_id, "following_id": following_id})
    if existing is not None:
        raise ServiceError(status_code=409, message="You are already following this user.")

    follow = Follow(follower_id=follower_id, following_id=following_id)
    db.add(follow)
    db.commit()
    return follow


def unfollow_user(
    db: Session,
    *,
    follower_id: uuid.UUID,
    following_id: uuid.UUID,
) -> None:
    """Unfollow a user. Raises ServiceError if follow does not exist."""
    if follower_id == following_id:
        raise ServiceError(status_code=400, message="You cannot unfollow yourself.")

    follow = db.get(Follow, {"follower_id": follower_id, "following_id": following_id})
    if follow is None:
        raise ServiceError(status_code=404, message="You are not following this user.")

    db.delete(follow)
    db.commit()


def get_followers(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[User]:
    """Return all users that follow the given user."""
    target = db.get(User, user_id)
    if target is None:
        raise ServiceError(status_code=404, message="User not found.")

    statement = (
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == user_id)
        .order_by(Follow.created_at.desc())
    )
    return list(db.scalars(statement).all())


def get_following(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[User]:
    """Return all users that the given user follows."""
    target = db.get(User, user_id)
    if target is None:
        raise ServiceError(status_code=404, message="User not found.")

    statement = (
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == user_id)
        .order_by(Follow.created_at.desc())
    )
    return list(db.scalars(statement).all())