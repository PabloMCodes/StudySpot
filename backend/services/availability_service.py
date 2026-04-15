"""
Availability logic file.
This just means crowd score calculations will be handled here.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.checkin import CheckIn, CheckInStatus

RECENT_WINDOW_MINUTES = 60
HALF_LIFE_MINUTES = 20
BASELINE_CONFIDENCE_FLOOR = 0.12

# Baseline occupancy prior by hour (0-1 scale).
BASELINE_BY_HOUR = {
    0: 0.10,
    1: 0.08,
    2: 0.06,
    3: 0.05,
    4: 0.05,
    5: 0.08,
    6: 0.15,
    7: 0.22,
    8: 0.35,
    9: 0.45,
    10: 0.55,
    11: 0.62,
    12: 0.68,
    13: 0.70,
    14: 0.65,
    15: 0.66,
    16: 0.68,
    17: 0.64,
    18: 0.52,
    19: 0.43,
    20: 0.35,
    21: 0.25,
    22: 0.18,
    23: 0.12,
}

STATUS_TO_RATIO = {
    CheckInStatus.plenty: 0.25,
    CheckInStatus.filling: 0.50,
    CheckInStatus.packed: 0.85,
}

LABEL_TO_RATIO = {
    "empty": 0.10,
    "available": 0.40,
    "busy": 0.70,
    "packed": 0.95,
}

TIME_PATTERN_BY_HOUR = {
    0: 0.18,
    1: 0.15,
    2: 0.12,
    3: 0.10,
    4: 0.10,
    5: 0.14,
    6: 0.20,
    7: 0.30,
    8: 0.40,
    9: 0.52,
    10: 0.61,
    11: 0.69,
    12: 0.76,
    13: 0.78,
    14: 0.73,
    15: 0.74,
    16: 0.75,
    17: 0.71,
    18: 0.61,
    19: 0.52,
    20: 0.43,
    21: 0.34,
    22: 0.28,
    23: 0.22,
}


def _decay_weight(minutes_old: float) -> float:
    """Return exponential decay weight where each half-life halves impact."""
    if minutes_old <= 0:
        return 1.0
    return 0.5 ** (minutes_old / HALF_LIFE_MINUTES)


def _baseline_ratio_for_time(reference_time: datetime) -> float:
    return BASELINE_BY_HOUR.get(reference_time.hour, 0.5)


def _time_pattern_ratio_for_time(reference_time: datetime) -> float:
    return TIME_PATTERN_BY_HOUR.get(reference_time.hour, 0.5)


def get_location_availability_snapshot(
    db: Session,
    *,
    location_id: uuid.UUID,
    now_utc: datetime | None = None,
) -> dict[str, float | int]:
    """Return occupancy estimate + confidence from baseline and recent check-ins."""
    reference_time = now_utc or datetime.now(timezone.utc)
    baseline_ratio = _baseline_ratio_for_time(reference_time)
    time_pattern_ratio = _time_pattern_ratio_for_time(reference_time)

    window_start = reference_time - timedelta(minutes=RECENT_WINDOW_MINUTES)
    statement = select(CheckIn).where(
        CheckIn.location_id == location_id,
        CheckIn.created_at >= window_start,
    )
    recent_checkins = list(db.scalars(statement).all())

    weighted_sum = 0.0
    total_weight = 0.0
    for checkin in recent_checkins:
        minutes_old = max(0.0, (reference_time - checkin.created_at).total_seconds() / 60.0)
        weight = _decay_weight(minutes_old)
        ratio = LABEL_TO_RATIO.get(checkin.crowd_label or "", STATUS_TO_RATIO[checkin.status])
        weighted_sum += ratio * weight
        total_weight += weight

    recent_ratio = (weighted_sum / total_weight) if total_weight > 0 else 0.0
    if total_weight > 0:
        blended_ratio = (0.5 * time_pattern_ratio) + (0.3 * recent_ratio) + (0.2 * baseline_ratio)
    else:
        # No recent check-ins: rely on cyclical pattern + baseline.
        blended_ratio = (0.7 * time_pattern_ratio) + (0.3 * baseline_ratio)

    observed_confidence = min(0.95, 1 - math.exp(-total_weight))
    confidence = BASELINE_CONFIDENCE_FLOOR + ((1 - BASELINE_CONFIDENCE_FLOOR) * observed_confidence)
    occupancy_percent = max(0, min(100, int(round(blended_ratio * 100))))

    return {
        "occupancy_percent": occupancy_percent,
        "confidence": round(confidence, 3),
        "active_checkins": len(recent_checkins),
        "availability_label": "AI availability",
    }


def get_bulk_location_availability_snapshots(
    db: Session,
    *,
    location_ids: list[uuid.UUID],
    now_utc: datetime | None = None,
) -> dict[uuid.UUID, dict[str, float | int]]:
    """Compute availability snapshots for many locations with a single DB query."""
    if not location_ids:
        return {}

    reference_time = now_utc or datetime.now(timezone.utc)
    baseline_ratio = _baseline_ratio_for_time(reference_time)
    time_pattern_ratio = _time_pattern_ratio_for_time(reference_time)
    window_start = reference_time - timedelta(minutes=RECENT_WINDOW_MINUTES)

    statement = select(CheckIn).where(
        CheckIn.location_id.in_(location_ids),
        CheckIn.created_at >= window_start,
    )
    recent_rows = list(db.scalars(statement).all())

    grouped: dict[uuid.UUID, list[CheckIn]] = {location_id: [] for location_id in location_ids}
    for row in recent_rows:
        grouped.setdefault(row.location_id, []).append(row)

    snapshots: dict[uuid.UUID, dict[str, float | int]] = {}
    for location_id in location_ids:
        rows = grouped.get(location_id, [])
        weighted_sum = 0.0
        total_weight = 0.0
        for checkin in rows:
            minutes_old = max(0.0, (reference_time - checkin.created_at).total_seconds() / 60.0)
            weight = _decay_weight(minutes_old)
            ratio = LABEL_TO_RATIO.get(checkin.crowd_label or "", STATUS_TO_RATIO[checkin.status])
            weighted_sum += ratio * weight
            total_weight += weight

        recent_ratio = (weighted_sum / total_weight) if total_weight > 0 else 0.0
        if total_weight > 0:
            blended_ratio = (0.5 * time_pattern_ratio) + (0.3 * recent_ratio) + (0.2 * baseline_ratio)
        else:
            blended_ratio = (0.7 * time_pattern_ratio) + (0.3 * baseline_ratio)

        observed_confidence = min(0.95, 1 - math.exp(-total_weight))
        confidence = BASELINE_CONFIDENCE_FLOOR + ((1 - BASELINE_CONFIDENCE_FLOOR) * observed_confidence)
        snapshots[location_id] = {
            "occupancy_percent": max(0, min(100, int(round(blended_ratio * 100)))),
            "confidence": round(confidence, 3),
            "active_checkins": len(rows),
            "availability_label": "AI availability",
        }

    return snapshots
