"""
Location route file.
This just means endpoints for listing and viewing study spots go here.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from schemas.location_schema import LocationResponse
from services import location_service

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("")
def list_locations(db: Session = Depends(get_db)):
    try:
        locations = location_service.list_locations(db)
        data = [LocationResponse.model_validate(location).model_dump() for location in locations]
        return {"success": True, "data": data, "error": None}
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
