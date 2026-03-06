"""
Auth route file.
This just means login and token endpoints will live here.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from schemas.auth_schema import GoogleAuthRequest
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/google")
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Exchange a Google ID token for a backend JWT.

    Response format follows project standard:
    - success: {"success": true, "data": {...}, "error": null}
    - failure: {"success": false, "data": null, "error": "..."}
    """
    try:
        token_data = auth_service.authenticate_google_user(db=db, id_token=payload.id_token)
        return {"success": True, "data": token_data}

    except ValueError as exc:
        return JSONResponse(status_code=400, content={"success": False, "data": None, "error": " server cannot process due to client-side issues"})
    except Exception:
        return JSONResponse(status_code=500, content={"success": False, "data": None,"error": "Authentication failed"})
