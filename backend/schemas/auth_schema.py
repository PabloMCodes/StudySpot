"""
Auth schema file.
This just means request/response data shapes for auth go here.
"""

from pydantic import BaseModel, ConfigDict


class GoogleAuthRequest(BaseModel):
    """Payload sent from frontend after Google sign-in."""

    id_token: str


class SupabaseAuthRequest(BaseModel):
    """Payload sent from frontend after Supabase email/password auth."""

    access_token: str


class TokenResponse(BaseModel):
    """JWT payload shape returned inside the API `data` field."""

    access_token: str
    token_type: str = "bearer"

    model_config = ConfigDict(from_attributes=True)
