import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from backend.app.database import Base

class Subtitle(Base):
    __tablename__ = "subtitles"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    language = Column(String(50), default="auto")
    label = Column(String(100), default="Primary Subtitles")
    is_primary = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="subtitles")
    segments = relationship("SubtitleSegment", back_populates="subtitle", cascade="all, delete-orphan", order_by="SubtitleSegment.start_time")

class SubtitleSegment(Base):
    __tablename__ = "subtitle_segments"

    id = Column(Integer, primary_key=True, index=True)
    subtitle_id = Column(Integer, ForeignKey("subtitles.id", ondelete="CASCADE"), nullable=False)
    sequence_number = Column(Integer, nullable=False, default=1)
    start_time = Column(Float, nullable=False)  # Seconds (e.g. 1.25)
    end_time = Column(Float, nullable=False)    # Seconds (e.g. 4.80)
    text = Column(Text, nullable=False)
    speaker = Column(String(100), default="Speaker 1")
    
    # Word-level breakdown: [{'word': 'Xin', 'start': 1.25, 'end': 1.50, 'probability': 0.98}, ...]
    words = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    subtitle = relationship("Subtitle", back_populates="segments")

class Speaker(Base):
    __tablename__ = "speakers"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    color = Column(String(50), default="#3B82F6")  # Hex color for UI badge
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="speakers")
