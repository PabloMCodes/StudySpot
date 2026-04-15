"""
Ranking logic file.
This just means sorting spots/sessions will be handled here.
"""

from __future__ import annotations

from dataclasses import dataclass

from models.location import Location

MAX_DISTANCE_METERS = 5_000


@dataclass
class RankedLocation:
    location: Location
    score: float
    distance_score: float
    preference_match_score: float
    popularity_score: float


def normalize_distance_score(distance_meters: float | None) -> float:
    if distance_meters is None:
        return 0.5
    bounded = min(max(distance_meters, 0.0), float(MAX_DISTANCE_METERS))
    return 1.0 - (bounded / float(MAX_DISTANCE_METERS))


def compute_preference_match(location: Location) -> float:
    quiet_component = max(0.0, min(location.quiet_level / 5.0, 1.0))
    outlet_component = 1.0 if location.has_outlets else 0.4

    category_text = " ".join(
        [
            (location.category or "").lower(),
            " ".join(location.types or []).lower(),
            location.name.lower(),
        ]
    )
    if any(token in category_text for token in ("library", "bookstore")):
        category_component = 1.0
    elif any(token in category_text for token in ("cafe", "coffee", "restaurant")):
        category_component = 0.85
    else:
        category_component = 0.6

    return (quiet_component * 0.45) + (outlet_component * 0.35) + (category_component * 0.20)


def compute_popularity(location: Location) -> float:
    rating_component = (location.rating or 0.0) / 5.0
    review_count = location.review_count or 0
    review_component = min(1.0, review_count / 500.0)
    if review_count == 0 and location.rating is None:
        return 0.45
    return (rating_component * 0.7) + (review_component * 0.3)


def compute_recommendation_score(
    *,
    availability_score: float,
    distance_score: float,
    preference_match_score: float,
    popularity_score: float,
) -> float:
    return (
        (0.4 * availability_score)
        + (0.25 * distance_score)
        + (0.2 * preference_match_score)
        + (0.15 * popularity_score)
    )
