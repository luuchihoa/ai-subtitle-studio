from typing import List, Optional, Any
from pydantic import BaseModel
import datetime
from backend.app.schemas.subtitle import SubtitleResponse, SpeakerResponse

class ProjectBase(BaseModel):
    title: str

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    title: Optional[str] = None

class ProjectResponse(ProjectBase):
    id: int
    filename: str
    file_path: str
    media_type: str
    duration: float
    waveform_data: Optional[List[float]] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    subtitles: List[SubtitleResponse] = []
    speakers: List[SpeakerResponse] = []

    class Config:
        from_attributes = True

class ProjectListItem(BaseModel):
    id: int
    title: str
    filename: str
    media_type: str
    duration: float
    subtitle_count: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True
