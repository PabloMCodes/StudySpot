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
from dependencies.auth_dependency import get_current_user
from models.user import User
from schemas.location_schema import (
    LocationInteractionCreate,
    LocationResponse,
    SavedLocationMutationResponse,
    SavedLocationResponse,
)
from schemas.photo_schema import LocationPhotosResponse, SessionPhotoResponse
from services import availability_service, location_interaction_service, location_service, photo_service

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/saved")
def list_saved_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        saved_locations = location_service.list_saved_locations_for_user(
            db,
            user_id=current_user.id,
        )
        data = [
            SavedLocationResponse(
                location=LocationResponse.model_validate(saved_location.location),
                saved_at=saved_location.saved_at,
            ).model_dump(mode="json")
            for saved_location in saved_locations
        ]
        return {"success": True, "data": data, "error": None}
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to fetch saved locations"},
        )


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
    sort: Literal["name", "newest", "distance", "best_spots", "highest_availability", "closest"] = Query(default="name"),
    zoom_level: float | None = Query(default=None, ge=0, le=22),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    try:
        if sort in {"best_spots", "highest_availability", "closest"}:
            has_all_bbox_values = all(value is not None for value in (min_lat, max_lat, min_lng, max_lng))
            if not has_all_bbox_values:
                raise ValueError("min_lat, max_lat, min_lng, and max_lng are required for map sorting")
            center_lat = lat if lat is not None else ((min_lat + max_lat) / 2)
            center_lng = lng if lng is not None else ((min_lng + max_lng) / 2)
            locations = location_service.list_map_locations(
                db,
                min_lat=min_lat,
                max_lat=max_lat,
                min_lng=min_lng,
                max_lng=max_lng,
                center_lat=center_lat,
                center_lng=center_lng,
                sort_mode=sort,
                zoom_level=zoom_level,
                query_text=q,
                limit=limit,
                offset=offset,
            )
        elif lat is not None and lng is not None and sort == "distance":
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


@router.post("/{location_id}/save")
def save_location(location_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        saved_location = location_service.save_location_for_user(
            db,
            user_id=current_user.id,
            location_id=location_id,
        )
        data = SavedLocationMutationResponse(
            location_id=location_id,
            is_saved=True,
            saved_at=saved_location.saved_at,
        ).model_dump(mode="json")
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        db.rollback()
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to save location"},
        )


@router.delete("/{location_id}/save")
def unsave_location(location_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        location_service.remove_saved_location_for_user(
            db,
            user_id=current_user.id,
            location_id=location_id,
        )
        data = SavedLocationMutationResponse(
            location_id=location_id,
            is_saved=False,
            saved_at=None,
        ).model_dump(mode="json")
        return {"success": True, "data": data, "error": None}
    except ValueError as exc:
        db.rollback()
        return JSONResponse(
            status_code=404,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to unsave location"},
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
