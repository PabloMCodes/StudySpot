"""
Distance helper file.
This just means location distance math will be handled here.
"""

from __future__ import annotations

import math

EARTH_RADIUS_METERS = 6_371_000


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance between two coordinates in meters."""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    lat_delta = math.radians(lat2 - lat1)
    lng_delta = math.radians(lng2 - lng1)

    a = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(lng_delta / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_METERS * c
