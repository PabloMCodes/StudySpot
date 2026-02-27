"""
Auth schema file.
This just means request/response data shapes for auth go here.
"""

from pydantic import BaseModel, ConfigDict


class GoogleAuthRequest(BaseModel):
    """Payload sent from frontend after Google sign-in."""

    id_token: str


class TokenResponse(BaseModel):
    """JWT response payload returned by backend auth endpoints."""

    access_token: str
    token_type: str = "bearer"

    model_config = ConfigDict(from_attributes=True)
