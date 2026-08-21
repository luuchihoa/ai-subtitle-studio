import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Subtitle Studio"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Base Directories
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    EXPORT_DIR: Path = BASE_DIR / "exports"
    
    # Database
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/subtitles.db"
    
    # AI Engine Defaults
    DEFAULT_WHISPER_MODEL: str = "base"  # tiny, base, small, medium, large-v3, large-v3-turbo
    DEVICE: str = "auto"  # auto, cpu, cuda, mps
    COMPUTE_TYPE: str = "default"  # int8, float16, float32, default
    
    # Subtitling Broadcast Standards (Netflix/BBC Guidelines)
    DEFAULT_MAX_CPL: int = 40  # Max characters per line
    DEFAULT_MAX_LINES: int = 2  # Max lines per subtitle screen
    DEFAULT_MIN_DURATION: float = 1.0  # Min duration in seconds
    DEFAULT_MAX_DURATION: float = 7.0  # Max duration in seconds
    DEFAULT_MAX_CPS: float = 20.0  # Max reading speed (characters per second)
    
    # Optional Cloud API keys (if user wishes to use cloud models)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.EXPORT_DIR.mkdir(parents=True, exist_ok=True)
