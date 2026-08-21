from fastapi import APIRouter
from backend.app.api.projects import router as projects_router
from backend.app.api.transcription import router as transcription_router
from backend.app.api.subtitles import router as subtitles_router
from backend.app.api.export import router as export_router

api_router = APIRouter()
api_router.include_router(projects_router)
api_router.include_router(transcription_router)
api_router.include_router(subtitles_router)
api_router.include_router(export_router)
