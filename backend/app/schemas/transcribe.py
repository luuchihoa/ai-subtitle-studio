from typing import Optional, List
from pydantic import BaseModel, Field

class TranscribeRequest(BaseModel):
    model_size: str = Field("base", description="tiny, base, small, medium, large-v3, large-v3-turbo")
    language: Optional[str] = Field(None, description="Language code (e.g. 'vi', 'en', 'ja') or None for auto-detect")
    enable_vad: bool = Field(True, description="Enable Voice Activity Detection to filter background noise and silence")
    enable_word_timestamps: bool = Field(True, description="Extract exact millisecond word-level timestamps")
    enable_diarization: bool = Field(False, description="Identify and separate different speakers")
    num_speakers: Optional[int] = Field(None, description="Exact number of speakers if known")
    
    # Subtitle formatting parameters
    max_cpl: int = Field(40, description="Max characters per line (Netflix: 37-42)")
    max_lines: int = Field(2, description="Max lines per subtitle block")
    min_duration: float = Field(1.0, description="Min duration per subtitle in seconds")
    max_duration: float = Field(7.0, description="Max duration per subtitle in seconds")
    max_cps: float = Field(20.0, description="Max reading speed (characters per second)")
    
    # NLP Refinement
    remove_fillers: bool = Field(False, description="Remove filler words like 'ừm', 'à', 'you know'")
    filter_hallucinations: bool = Field(True, description="Filter repeating hallucination loops")

class ReSegmentRequest(BaseModel):
    max_cpl: int = Field(40, ge=20, le=80)
    max_lines: int = Field(2, ge=1, le=4)
    min_duration: float = Field(1.0, ge=0.5, le=5.0)
    max_duration: float = Field(7.0, ge=2.0, le=15.0)
    max_cps: float = Field(20.0, ge=10.0, le=35.0)

class TranslateRequest(BaseModel):
    target_language: str = Field("vi", description="Target language code: vi, en, ja, ko, zh, fr, de, es...")
    source_language: Optional[str] = Field("auto")
    preserve_timestamps: bool = Field(True)

class ExportRequest(BaseModel):
    format: str = Field("srt", description="srt, vtt, ass, json, txt, fcpxml")
    include_speakers: bool = Field(True)
    highlight_words: bool = Field(False, description="For ASS format: enable karaoke/word highlight animation")
