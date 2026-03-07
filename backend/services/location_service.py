"""
Location service file.
This means location read logic lives here, not in routes.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.location import Location


def list_locations(db: Session) -> list[Location]:
    """Return all locations from the database."""
    statement = select(Location)
    return list(db.scalars(statement).all())


def get_location_by_id(db: Session, location_id: uuid.UUID) -> Location:
    """Return one location by ID, or raise if it doesn't exist."""
    location = db.get(Location, location_id)
    if location is None:
        raise ValueError("Location not found")
    return location
