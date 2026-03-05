"""Seed locations from JSON with idempotent upsert-by-source_key behavior."""

from __future__ import annotations

import json
from pathlib import Path

from database import SessionLocal
from models.location import Location

DATA_FILE = Path(__file__).resolve().parent / "data" / "locations_orlando.json"
REQUIRED_FIELDS = {
    "source_key",
    "name",
    "address",
    "latitude",
    "longitude",
    "category",
    "description",
    "open_time",
    "close_time",
}
SYNC_FIELDS = (
    "name",
    "address",
    "latitude",
    "longitude",
    "category",
    "description",
    "open_time",
    "close_time",
)


def _load_locations() -> list[dict]:
    with DATA_FILE.open("r", encoding="utf-8") as data_file:
        payload = json.load(data_file)

    if not isinstance(payload, list):
        raise ValueError("Seed data must be a JSON list of location objects.")

    for index, location in enumerate(payload):
        if not isinstance(location, dict):
            raise ValueError(f"Location at index {index} is not a JSON object.")

        missing = REQUIRED_FIELDS - set(location.keys())
        if missing:
            missing_sorted = ", ".join(sorted(missing))
            raise ValueError(f"Location at index {index} is missing required fields: {missing_sorted}")

    return payload


def _apply_fields(location: Location, values: dict) -> None:
    for field in SYNC_FIELDS:
        # Seed payload intentionally includes address/category keys for forward compatibility.
        if hasattr(Location, field):
            setattr(location, field, values[field])


def seed_locations() -> None:
    db = SessionLocal()
    inserted = 0
    updated = 0

    try:
        locations = _load_locations()

        for loc in locations:
            existing = db.query(Location).filter(Location.source_key == loc["source_key"]).first()

            if existing:
                _apply_fields(existing, loc)
                updated += 1
            else:
                new_location = Location(source_key=loc["source_key"])
                _apply_fields(new_location, loc)
                db.add(new_location)
                inserted += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(f"Inserted {inserted} locations.")
    print(f"Updated {updated} locations.")


if __name__ == "__main__":
    seed_locations()
