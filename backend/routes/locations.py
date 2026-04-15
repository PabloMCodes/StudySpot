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
from schemas.location_schema import LocationInteractionCreate, LocationResponse
from schemas.photo_schema import LocationPhotosResponse, SessionPhotoResponse
from services import availability_service, location_interaction_service, location_service, photo_service

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
    q: str | None = Query(default=None, min_length=1, max_length=120),
    sort: Literal["name", "newest", "distance"] = Query(default="name"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    try:
        if lat is not None and lng is not None and sort == "distance":
            locations = location_service.list_recommended_locations(
                db,
                lat=lat,
                lng=lng,
                radius_m=radius_m,
                query_text=q,
                offset=offset,
                limit=limit,
            )
        else:
            locations = location_service.list_locations_filtered(
                db,
                lat=lat,
                lng=lng,
                radius_m=radius_m,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lng=min_lng,
                max_lng=max_lng,
                query_text=q,
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


@router.get("/{location_id}/availability")
def get_location_availability(location_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        location_service.get_location_by_id(db, location_id)
        availability = availability_service.get_location_availability_snapshot(
            db,
            location_id=location_id,
        )
        return {"success": True, "data": availability, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch availability"},
        )


@router.post("/{location_id}/interactions")
def log_location_interaction(
    location_id: uuid.UUID,
    payload: LocationInteractionCreate,
    db: Session = Depends(get_db),
):
    try:
        interaction = location_interaction_service.log_location_interaction(
            db,
            location_id=location_id,
            interaction_type=payload.interaction_type,
        )
        return {
            "success": True,
            "data": {
                "id": str(interaction.id),
                "location_id": str(interaction.location_id),
                "interaction_type": interaction.interaction_type,
                "created_at": interaction.created_at.isoformat(),
            },
            "error": None,
        }
    except ValueError as exc:
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to log location interaction"},
        )


@router.get("/{location_id}/photos")
def get_location_photos(location_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        most_helpful, recent = photo_service.get_location_photos(db, location_id=location_id)
        payload = LocationPhotosResponse(
            most_helpful=(
                SessionPhotoResponse(
                    id=most_helpful.id,
                    session_id=most_helpful.session_id,
                    user_id=most_helpful.user_id,
                    location_id=most_helpful.location_id,
                    image_url=most_helpful.image_url,
                    helpful_count=most_helpful.helpful_count,
                    created_at=most_helpful.created_at,
                )
                if most_helpful is not None
                else None
            ),
            recent_photos=[
                SessionPhotoResponse(
                    id=item.id,
                    session_id=item.session_id,
                    user_id=item.user_id,
                    location_id=item.location_id,
                    image_url=item.image_url,
                    helpful_count=item.helpful_count,
                    created_at=item.created_at,
                )
                for item in recent
            ],
        )
        return {"success": True, "data": payload.model_dump(mode="json"), "error": None}
    except ValueError as exc:
        return JSONResponse(status_code=404, content={"success": False, "data": None, "error": str(exc)})
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch location photos"},
        )
