"""
Location service file.
This means location read logic lives here, not in routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from models.location import Location
from models.user_location import UserLocation

EARTH_RADIUS_METERS = 6_371_000
MAX_RECOMMENDATIONS = 15

EXCLUDED_TYPE_TOKENS = {
    "gas_station",
    "convenience_store",
    "fast_food",
    "grocery_or_supermarket",
    "department_store",
    "shopping_mall",
    "supermarket",
    "drugstore",
    "pharmacy",
    "hardware_store",
    "home_goods_store",
    "electronics_store",
}
EXCLUDED_NAME_TOKENS = {
    "gas",
    "shell",
    "chevron",
    "exxon",
    "bp",
    "wawa",
    "racetrac",
    "race trac",
    "7-eleven",
    "7 eleven",
    "circle k",
    "speedway",
    "pilot",
    "sunoco",
    "mobil",
    "cumberland farms",
    "drive-thru",
    "drive thru",
    "mcdonald",
    "burger king",
    "wendy's",
    "taco bell",
    "kfc",
    "walmart",
    "target",
    "costco",
    "sam's club",
    "sams club",
    "aldi",
    "publix",
    "whole foods",
    "trader joe",
    "dollar tree",
    "dollar general",
    "family dollar",
}
INCLUDED_HINT_TOKENS = {"cafe", "coffee", "library", "bookstore", "study", "restaurant"}


@dataclass
class SavedLocationRecord:
    """Normalized saved location payload returned by bookmark service helpers."""

    location: Location
    saved_at: datetime


def _distance_meters_expression(lat: float, lng: float):
    """Return a SQL expression that calculates great-circle distance in meters."""
    return EARTH_RADIUS_METERS * 2 * func.asin(
        func.sqrt(
            func.pow(func.sin((func.radians(Location.latitude) - func.radians(lat)) / 2), 2)
            + func.cos(func.radians(lat))
            * func.cos(func.radians(Location.latitude))
            * func.pow(func.sin((func.radians(Location.longitude) - func.radians(lng)) / 2), 2)
        )
    )


def list_locations(db: Session) -> list[Location]:
    """Return all locations from the database."""
    statement = select(Location).order_by(Location.name.asc())
    return list(db.scalars(statement).all())


def get_location_by_id(db: Session, location_id: uuid.UUID) -> Location:
    """Return one location by ID, or raise if it doesn't exist."""
    location = db.get(Location, location_id)
    if location is None:
        raise ValueError("Location not found")
    return location

# Save a location for a user, returning the existing bookmark when already saved
def save_location_for_user(db: Session,*, user_id: uuid.UUID, location_id: uuid.UUID) -> SavedLocationRecord:
    location = get_location_by_id(db, location_id)
    saved_location = db.get(
        UserLocation,
        {
            "user_id": user_id,
            "location_id": location_id,
        },
    )

    if saved_location is None:
        saved_location = UserLocation(user_id=user_id, location_id=location_id)
        db.add(saved_location)
        db.commit()
        db.refresh(saved_location)

    return SavedLocationRecord(location=location, saved_at=saved_location.saved_at)

# Remove a saved location for a user. Returns whether a bookmark was deleted
def remove_saved_location_for_user(db: Session,*, user_id: uuid.UUID, location_id: uuid.UUID) -> bool:
    get_location_by_id(db, location_id)
    saved_location = db.get(
        UserLocation,
        {
            "user_id": user_id,
            "location_id": location_id,
        },
    )
    if saved_location is None:
        return False

    db.delete(saved_location)
    db.commit()
    return True

# Return a user's saved locations ordered by most recently saved first
def list_saved_locations_for_user(db: Session, *, user_id: uuid.UUID) -> list[SavedLocationRecord]:
    statement = (
        select(UserLocation)
        .options(selectinload(UserLocation.location))
        .where(UserLocation.user_id == user_id)
        .order_by(UserLocation.saved_at.desc())
    )
    saved_rows = list(db.scalars(statement).all())
    return [
        SavedLocationRecord(location=row.location, saved_at=row.saved_at)
        for row in saved_rows
        if row.location is not None
    ]


def list_locations_filtered(
    db: Session,
    *,
    lat: float | None = None,
    lng: float | None = None,
    radius_m: float | None = None,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lng: float | None = None,
    max_lng: float | None = None,
    query_text: str | None = None,
    sort: Literal["name", "newest", "distance"] = "name",
    limit: int = 50,
    offset: int = 0,
) -> list[Location]:
    """List locations with optional area filtering, sorting, and pagination."""
    statement = select(Location)
    distance_expression = None
    has_any_bbox_value = any(value is not None for value in (min_lat, max_lat, min_lng, max_lng))
    has_all_bbox_values = all(value is not None for value in (min_lat, max_lat, min_lng, max_lng))

    if (lat is None) != (lng is None):
        raise ValueError("lat and lng must be provided together")
    if has_any_bbox_value and not has_all_bbox_values:
        raise ValueError("min_lat, max_lat, min_lng, and max_lng must be provided together")
    if has_all_bbox_values:
        if min_lat > max_lat:
            raise ValueError("min_lat must be less than or equal to max_lat")
        if min_lng > max_lng:
            raise ValueError("min_lng must be less than or equal to max_lng")
        statement = statement.where(Location.latitude >= min_lat, Location.latitude <= max_lat)
        statement = statement.where(Location.longitude >= min_lng, Location.longitude <= max_lng)

    if lat is not None and lng is not None:
        distance_expression = _distance_meters_expression(lat, lng)

    if radius_m is not None:
        if distance_expression is None:
            raise ValueError("lat and lng are required when radius_m is provided")
        statement = statement.where(distance_expression <= radius_m)

    if query_text is not None:
        normalized_query = query_text.strip()
        if normalized_query:
            pattern = f"%{normalized_query}%"
            statement = statement.where(
                or_(
                    Location.name.ilike(pattern),
                    Location.address.ilike(pattern),
                    Location.category.ilike(pattern),
                    Location.description.ilike(pattern),
                    Location.editorial_summary.ilike(pattern),
                )
            )

    if sort == "distance":
        if distance_expression is None:
            raise ValueError("lat and lng are required when sort=distance")
        statement = statement.order_by(distance_expression.asc(), Location.name.asc())
    elif sort == "newest":
        statement = statement.order_by(Location.created_at.desc())
    else:
        statement = statement.order_by(Location.name.asc())

    statement = statement.offset(offset).limit(limit)
    return list(db.scalars(statement).all())


def is_study_friendly_location(location: Location) -> bool:
    types_text = " ".join(location.types or []).lower()
    searchable = " ".join(
        [
            location.name.lower(),
            (location.category or "").lower(),
            (location.description or "").lower(),
            (location.editorial_summary or "").lower(),
            types_text,
        ]
    )

    if any(token in types_text for token in EXCLUDED_TYPE_TOKENS):
        return False
    if any(token in searchable for token in EXCLUDED_NAME_TOKENS):
        return False

    has_seating_signal = location.has_outlets or location.quiet_level >= 3 or any(
        token in searchable for token in ("seat", "seating", "table", "study", "library", "bookstore")
    )
    if not has_seating_signal:
        return False

    if any(token in searchable for token in INCLUDED_HINT_TOKENS):
        return True

    # Keep neutral locations unless they match known bad patterns above.
    return True


def list_recommended_locations(
    db: Session,
    *,
    lat: float,
    lng: float,
    radius_m: float | None = None,
    query_text: str | None = None,
    offset: int = 0,
    limit: int = MAX_RECOMMENDATIONS,
) -> list[Location]:
    if offset < 0:
        offset = 0
    if limit < 1:
        limit = 1

    candidate_limit = max((offset + limit) * 4, 100)
    candidates = list_locations_filtered(
        db,
        lat=lat,
        lng=lng,
        radius_m=radius_m,
        query_text=query_text,
        sort="distance",
        limit=candidate_limit,
        offset=0,
    )
    filtered = [location for location in candidates if is_study_friendly_location(location)]
    page_end = offset + limit
    return filtered[offset:page_end]
