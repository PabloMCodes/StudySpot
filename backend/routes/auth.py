"""
Auth route file.
This just means login and token endpoints will live here.
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from schemas.auth_schema import GoogleAuthRequest, SupabaseAuthRequest
from dependencies.auth_dependency import get_current_user
from services import auth_service

from schemas.user_schema import UserPrivateResponse
from models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# google ID token for JWT, response standard format
@router.post("/login")
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        token_data = auth_service.authenticate_google_user(db=db, id_token=payload.id_token)
        return {"success": True, "data": token_data, "error": None}
    except ValueError as exc:
        normalized_error = str(exc).lower()
        status_code = 500 if "configured" in normalized_error else 400
        error_message = "Authentication is currently unavailable" if status_code == 500 else "Invalid authentication credentials"
        return JSONResponse(
            status_code=status_code,
            content={"success": False, "data": None, "error": error_message},
        )
    except Exception:
        logger.exception("Unexpected error during Google authentication")
        return JSONResponse(status_code=500, content={"success": False, "data": None,"error": "Authentication failed"})


@router.post("/supabase")
def supabase_auth(payload: SupabaseAuthRequest, db: Session = Depends(get_db)):
    try:
        token_data = auth_service.authenticate_supabase_user(db=db, access_token=payload.access_token)
        return {"success": True, "data": token_data, "error": None}
    except ValueError as exc:
        normalized_error = str(exc).lower()
        status_code = 500 if "configured" in normalized_error else 400
        error_message = "Authentication is currently unavailable" if status_code == 500 else "Invalid authentication credentials"
        return JSONResponse(
            status_code=status_code,
            content={"success": False, "data": None, "error": error_message},
        )
    except Exception:
        logger.exception("Unexpected error during Supabase authentication")
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Authentication failed"})

# get current user information in order to know if user still active / log in
@router.get("/me")
async def get_current_user_info(current_user = Depends(get_current_user)):
    try:
        data = UserPrivateResponse.model_validate(current_user)
        return {"success": True, "data": data, "error": None}
    except Exception:
        return JSONResponse(status_code=500, content={"success": False, "data": None, "error": "Failed to fetch current user"})


@router.delete("/me")
def delete_current_user_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        auth_service.delete_user_account(db=db, user=current_user)
        return {"success": True, "data": {"deleted": True}, "error": None}
    except SQLAlchemyError:
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to delete account"},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"success": False, "data": None, "error": "Failed to delete account"},
        )
