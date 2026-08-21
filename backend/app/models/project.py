import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from backend.app.database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, default="Untitled Project")
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    media_type = Column(String(50), default="audio")  # audio or video
    duration = Column(Float, default=0.0)  # In seconds
    waveform_data = Column(JSON, nullable=True)  # List of normalized peak amplitudes [0.0 - 1.0]
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    subtitles = relationship("Subtitle", back_populates="project", cascade="all, delete-orphan")
    speakers = relationship("Speaker", back_populates="project", cascade="all, delete-orphan")
