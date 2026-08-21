import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.project import Project
from backend.app.schemas.project import ProjectResponse, ProjectListItem
from backend.app.core.audio import get_media_info, generate_waveform_peaks, extract_and_convert_audio

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectListItem])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    items = []
    for p in projects:
        sub_count = len(p.subtitles)
        items.append({
            "id": p.id,
            "title": p.title,
            "filename": p.filename,
            "media_type": p.media_type,
            "duration": p.duration,
            "subtitle_count": sub_count,
            "created_at": p.created_at
        })
    return items

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    file: UploadFile = File(...),
    title: str = Form(None),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Vui lòng chọn file âm thanh hoặc video")

    file_ext = os.path.splitext(file.filename)[1].lower()
    project_title = title or os.path.splitext(file.filename)[0]

    # Save uploaded file
    safe_filename = f"{int(os.times().elapsed)}_{file.filename.replace(' ', '_')}"
    saved_path = settings.UPLOAD_DIR / safe_filename

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Analyze media info
    media_info = get_media_info(str(saved_path))
    duration = media_info.get("duration", 0.0)
    media_type = "video" if media_info.get("is_video") else "audio"

    # Pre-generate 16kHz WAV and Waveform peaks
    wav_path = str(settings.UPLOAD_DIR / f"temp_{safe_filename}.wav")
    extract_and_convert_audio(str(saved_path), wav_path)
    waveform_peaks = generate_waveform_peaks(wav_path)
    if os.path.exists(wav_path):
        os.remove(wav_path)

    project = Project(
        title=project_title,
        filename=file.filename,
        file_path=str(saved_path),
        media_type=media_type,
        duration=duration,
        waveform_data=waveform_peaks
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return project

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    # Delete physical file
    if os.path.exists(project.file_path):
        try:
            os.remove(project.file_path)
        except Exception:
            pass

    # Delete 16k wav if exists
    wav_path = settings.UPLOAD_DIR / f"project_{project.id}_16k.wav"
    if os.path.exists(wav_path):
        try:
            os.remove(wav_path)
        except Exception:
            pass

    db.delete(project)
    db.commit()
    return None

@router.get("/{project_id}/media")
def stream_media(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not os.path.exists(project.file_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file media")

    # Detect mime type
    ext = os.path.splitext(project.file_path)[1].lower()
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".webm": "video/webm"
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(project.file_path, media_type=media_type, filename=project.filename)
