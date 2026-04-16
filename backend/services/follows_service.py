"""
Follow service file.
This means follow/unfollow business logic stays out of routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import and_, exists, select
from sqlalchemy.orm import aliased
from sqlalchemy.orm import Session

from models.follow import Follow
from models.user import User


@dataclass
class ServiceError(Exception):
    """Typed service error used by routes to map status codes."""

    status_code: int
    message: str


def send_friend_request(
    db: Session,
    *,
    requester_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> Follow:
    """Send a friend request (stored as one directional follow row)."""
    if requester_id == target_user_id:
        raise ServiceError(status_code=400, message="You cannot send a friend request to yourself.")

    target = db.get(User, target_user_id)
    if target is None:
        raise ServiceError(status_code=404, message="User not found.")

    existing = db.get(Follow, {"follower_id": requester_id, "following_id": target_user_id})
    if existing is not None:
        reverse = db.get(Follow, {"follower_id": target_user_id, "following_id": requester_id})
        if reverse is not None:
            raise ServiceError(status_code=409, message="You are already friends with this user.")
        raise ServiceError(status_code=409, message="Friend request already sent.")

    incoming = db.get(Follow, {"follower_id": target_user_id, "following_id": requester_id})
    if incoming is not None:
        raise ServiceError(status_code=409, message="This user already sent you a friend request.")

    follow = Follow(follower_id=requester_id, following_id=target_user_id)
    db.add(follow)
    db.commit()
    return follow


def accept_friend_request(
    db: Session,
    *,
    current_user_id: uuid.UUID,
    requester_id: uuid.UUID,
) -> None:
    """Accept an incoming friend request by creating the reciprocal row."""
    if current_user_id == requester_id:
        raise ServiceError(status_code=400, message="Invalid request.")

    requester = db.get(User, requester_id)
    if requester is None:
        raise ServiceError(status_code=404, message="User not found.")

    incoming = db.get(Follow, {"follower_id": requester_id, "following_id": current_user_id})
    if incoming is None:
        raise ServiceError(status_code=404, message="No incoming friend request from this user.")

    reciprocal = db.get(Follow, {"follower_id": current_user_id, "following_id": requester_id})
    if reciprocal is None:
        db.add(Follow(follower_id=current_user_id, following_id=requester_id))
        db.commit()


def cancel_friend_request(
    db: Session,
    *,
    requester_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> None:
    """Cancel an outgoing friend request (one-way row only)."""
    if requester_id == target_user_id:
        raise ServiceError(status_code=400, message="Invalid request.")

    follow = db.get(Follow, {"follower_id": requester_id, "following_id": target_user_id})
    if follow is None:
        raise ServiceError(status_code=404, message="Friend request not found.")

    reverse = db.get(Follow, {"follower_id": target_user_id, "following_id": requester_id})
    if reverse is not None:
        raise ServiceError(status_code=400, message="You are already friends. Use remove friend.")

    db.delete(follow)
    db.commit()


def decline_friend_request(
    db: Session,
    *,
    current_user_id: uuid.UUID,
    requester_id: uuid.UUID,
) -> None:
    """Decline an incoming friend request."""
    if current_user_id == requester_id:
        raise ServiceError(status_code=400, message="Invalid request.")

    incoming = db.get(Follow, {"follower_id": requester_id, "following_id": current_user_id})
    if incoming is None:
        raise ServiceError(status_code=404, message="Friend request not found.")

    reverse = db.get(Follow, {"follower_id": current_user_id, "following_id": requester_id})
    if reverse is not None:
        raise ServiceError(status_code=400, message="You are already friends. Use remove friend.")

    db.delete(incoming)
    db.commit()


def remove_friend(
    db: Session,
    *,
    current_user_id: uuid.UUID,
    other_user_id: uuid.UUID,
) -> None:
    """Remove a friendship by deleting both directions."""
    if current_user_id == other_user_id:
        raise ServiceError(status_code=400, message="Invalid request.")

    row_a = db.get(Follow, {"follower_id": current_user_id, "following_id": other_user_id})
    row_b = db.get(Follow, {"follower_id": other_user_id, "following_id": current_user_id})

    if row_a is None and row_b is None:
        raise ServiceError(status_code=404, message="Friendship not found.")

    if row_a is not None:
        db.delete(row_a)
    if row_b is not None:
        db.delete(row_b)
    db.commit()


def get_friends(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[User]:
    """Return all friends for user (mutual follow rows)."""
    target = db.get(User, user_id)
    if target is None:
        raise ServiceError(status_code=404, message="User not found.")

    reverse_follow = aliased(Follow)
    statement = (
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .join(
            reverse_follow,
            and_(
                reverse_follow.follower_id == User.id,
                reverse_follow.following_id == user_id,
            ),
        )
        .where(Follow.follower_id == user_id)
        .order_by(User.name.asc().nulls_last(), User.id.asc())
    )
    return list(db.scalars(statement).all())


def get_pending_incoming_requests(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[User]:
    """Users who sent requests to me that I have not accepted yet."""
    reverse_exists = exists(
        select(Follow.follower_id).where(
            Follow.follower_id == user_id,
            Follow.following_id == User.id,
        )
    )

    statement = (
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(
            Follow.following_id == user_id,
            ~reverse_exists,
        )
        .order_by(Follow.created_at.desc())
    )
    return list(db.scalars(statement).all())


def get_pending_outgoing_requests(
    db: Session,
    *,
    user_id: uuid.UUID,
) -> list[User]:
    """Users I requested but who haven't accepted yet."""
    target = db.get(User, user_id)
    if target is None:
        raise ServiceError(status_code=404, message="User not found.")

    reverse_exists = exists(
        select(Follow.follower_id).where(
            Follow.follower_id == User.id,
            Follow.following_id == user_id,
        )
    )

    statement = (
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(
            Follow.follower_id == user_id,
            ~reverse_exists,
        )
        .order_by(Follow.created_at.desc())
    )
    return list(db.scalars(statement).all())


def get_relationship_status(
    db: Session,
    *,
    current_user_id: uuid.UUID,
    other_user_id: uuid.UUID,
) -> str:
    """
    Return one of:
    - none
    - outgoing_request
    - incoming_request
    - friends
    """
    if current_user_id == other_user_id:
        return "self"
    outgoing = db.get(Follow, {"follower_id": current_user_id, "following_id": other_user_id})
    incoming = db.get(Follow, {"follower_id": other_user_id, "following_id": current_user_id})
    if outgoing is not None and incoming is not None:
        return "friends"
    if outgoing is not None:
        return "outgoing_request"
    if incoming is not None:
        return "incoming_request"
    return "none"


def get_friend_ids(db: Session, *, user_id: uuid.UUID) -> list[uuid.UUID]:
    """Return friend user ids for leaderboard aggregation."""
    reverse_follow = aliased(Follow)
    statement = (
        select(Follow.following_id)
        .join(
            reverse_follow,
            and_(
                reverse_follow.follower_id == Follow.following_id,
                reverse_follow.following_id == user_id,
            ),
        )
        .where(Follow.follower_id == user_id)
    )
    return list(db.scalars(statement).all())
