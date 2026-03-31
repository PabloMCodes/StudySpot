"""
Auth route file.
This just means login and token endpoints will live here.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from schemas.auth_schema import GoogleAuthRequest
from dependencies.auth_dependency import get_current_user
from services import auth_service

from schemas.user_schema import UserPrivateResponse
from models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

# google ID token for JWT, response standard format
@router.post("/login")
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        token_data = auth_service.authenticate_google_user(db=db, id_token=payload.id_token)
        return {"success": True, "data": token_data, "error": None}
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"success": False, "data": None, "error": str(exc)},
        )
    except Exception:
        return JSONResponse(status_code=500, content={"success": False, "data": None,"error": "Authentication failed"})

# get current user information in order to know if user still active / log in
@router.get("/me")
async def get_current_user_info(current_user = Depends(get_current_user)):
    try:
        data = UserPrivateResponse.model_validate(current_user)
        return {"success": True, "data": data, "error": None}
    except Exception:
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to fetch current user"})
