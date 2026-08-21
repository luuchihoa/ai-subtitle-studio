from typing import List, Optional, Any
from pydantic import BaseModel
import datetime

class WordDetail(BaseModel):
    word: str
    start: float
    end: float
    probability: Optional[float] = 1.0

class SubtitleSegmentBase(BaseModel):
    sequence_number: int
    start_time: float
    end_time: float
    text: str
    speaker: Optional[str] = "Speaker 1"
    words: Optional[List[WordDetail]] = None

class SubtitleSegmentCreate(SubtitleSegmentBase):
    pass

class SubtitleSegmentUpdate(BaseModel):
    sequence_number: Optional[int] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    text: Optional[str] = None
    speaker: Optional[str] = None
    words: Optional[List[WordDetail]] = None

class SubtitleSegmentResponse(SubtitleSegmentBase):
    id: int
    subtitle_id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class SubtitleResponse(BaseModel):
    id: int
    project_id: int
    language: str
    label: str
    is_primary: bool
    segments: List[SubtitleSegmentResponse] = []
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class SpeakerResponse(BaseModel):
    id: int
    project_id: int
    name: str
    color: str

    class Config:
        from_attributes = True

class BatchSegmentUpdate(BaseModel):
    segments: List[SubtitleSegmentBase]
