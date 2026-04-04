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

RECENT_WINDOW_HOURS = 6
HALF_LIFE_MINUTES = 90
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


def _decay_weight(minutes_old: float) -> float:
    """Return exponential decay weight where each half-life halves impact."""
    if minutes_old <= 0:
        return 1.0
    return 0.5 ** (minutes_old / HALF_LIFE_MINUTES)


def _baseline_ratio_for_time(reference_time: datetime) -> float:
    return BASELINE_BY_HOUR.get(reference_time.hour, 0.5)


def get_location_availability_snapshot(
    db: Session,
    *,
    location_id: uuid.UUID,
    now_utc: datetime | None = None,
) -> dict[str, float | int]:
    """Return occupancy estimate + confidence from baseline and recent check-ins."""
    reference_time = now_utc or datetime.now(timezone.utc)
    baseline_ratio = _baseline_ratio_for_time(reference_time)

    window_start = reference_time - timedelta(hours=RECENT_WINDOW_HOURS)
    statement = select(CheckIn).where(
        CheckIn.location_id == location_id,
        CheckIn.created_at >= window_start,
        CheckIn.expires_at > reference_time,
    )
    recent_checkins = list(db.scalars(statement).all())

    weighted_sum = 0.0
    total_weight = 0.0
    for checkin in recent_checkins:
        minutes_old = max(0.0, (reference_time - checkin.created_at).total_seconds() / 60.0)
        weight = _decay_weight(minutes_old)
        weighted_sum += STATUS_TO_RATIO[checkin.status] * weight
        total_weight += weight

    recent_ratio = (weighted_sum / total_weight) if total_weight > 0 else baseline_ratio
    observed_confidence = min(0.95, 1 - math.exp(-total_weight))
    confidence = BASELINE_CONFIDENCE_FLOOR + ((1 - BASELINE_CONFIDENCE_FLOOR) * observed_confidence)

    blended_ratio = baseline_ratio * (1 - confidence) + recent_ratio * confidence
    occupancy_percent = max(0, min(100, int(round(blended_ratio * 100))))

    return {
        "occupancy_percent": occupancy_percent,
        "confidence": round(confidence, 3),
        "active_checkins": len(recent_checkins),
        "availability_label": "AI availability",
    }
