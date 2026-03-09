"""
Location route file.
This just means endpoints for listing and viewing study spots go here.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from schemas.location_schema import LocationResponse
from services import location_service

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("")
def list_locations(
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    radius_m: float | None = Query(default=None, gt=0, le=100_000),
    min_lat: float | None = Query(default=None, ge=-90, le=90),
    max_lat: float | None = Query(default=None, ge=-90, le=90),
    min_lng: float | None = Query(default=None, ge=-180, le=180),
    max_lng: float | None = Query(default=None, ge=-180, le=180),
    sort: Literal["name", "newest", "distance"] = Query(default="name"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    try:
        locations = location_service.list_locations_filtered(
            db,
            lat=lat,
            lng=lng,
            radius_m=radius_m,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lng=min_lng,
            max_lng=max_lng,
            sort=sort,
            limit=limit,
            offset=offset,
        )
        data = [LocationResponse.model_validate(location).model_dump() for location in locations]
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch locations"},
        )


@router.get("/{location_id}")
def get_location(location_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        location = location_service.get_location_by_id(db, location_id)
        data = LocationResponse.model_validate(location).model_dump()
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch location"},
        )
