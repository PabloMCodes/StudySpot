"""
Check-in route file.
This just means endpoints for posting crowd updates go here.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user
from models.user import User
from schemas.checkin_schema import (
    CheckInCreate,
    NearbyCheckInPromptRequest,
)
from services import availability_service, checkin_service

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.post("")
def create_checkin(
    payload: CheckInCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        checkin = checkin_service.create_checkin(
            db,
            user_id=current_user.id,
            payload=payload,
        )
        data = checkin_service.build_checkin_response(
            checkin,
            requested_occupancy_percent=int(payload.occupancy_percent),
        )
        availability = availability_service.get_location_availability_snapshot(
            db,
            location_id=checkin.location_id,
        )
        return {
            "success": True,
            "data": {
                "checkin": data.model_dump(mode="json"),
                "availability": availability,
            },
            "error": None,
        }
    except checkin_service.ServiceError as exc:
        db.rollback()
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to create check-in"},
        )


@router.post("/prompt")
def get_checkin_prompt(
    payload: NearbyCheckInPromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        prompt = checkin_service.get_nearby_checkin_prompt(
            db,
            user_id=current_user.id,
            lat=payload.lat,
            lng=payload.lng,
        )
        return {"success": True, "data": prompt.model_dump(mode="json"), "error": None}
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to evaluate nearby prompt"},
        )
