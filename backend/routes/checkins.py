"""
Check-in route file.
This just means endpoints for posting crowd updates go here.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth_dependency import get_current_user
from models.checkin import CheckIn
from models.location import Location
from models.user import User
from schemas.checkin_schema import CheckInCreate, CheckInResponse

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.post("")
def create_checkin(
    payload: CheckInCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        location = db.get(Location, payload.location_id)
        if location is None:
            return JSONResponse(
                status_code=404
                content={"success": False, "data": None, "error": "Location not found"},
            )
        
        now = datetime.now(timezone.utc)

        checkin = CheckIn(
            user_id=current_user.id,
            location_id=payload.location_id,
            status=payload.status,
            expires_at=now + timedelta(minutes=30),
        )

        db.add(checkin)
        db.commit()
        db.refresh(checkin)

        data = CheckInResponse.model_validate(checkin)
        return {"success": True, "data": data.model_dump(mode="json"), "error": None}
    
    except Exception:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to create check-in"},
        )