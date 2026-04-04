"""
Backend app entry file.
This just means this is where the API server starts.
"""

from fastapi import FastAPI

from routes import auth, checkins, comments, locations

app = FastAPI(title="StudySpot API")

app.include_router(auth.router)
app.include_router(locations.router)
app.include_router(comments.router)
app.include_router(checkins.router)
