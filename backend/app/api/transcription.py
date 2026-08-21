import threading
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.project import Project
from backend.app.schemas.transcribe import TranscribeRequest
from backend.app.services.transcription_service import TranscriptionJobManager

router = APIRouter(prefix="/transcription", tags=["Transcription"])

@router.post("/{project_id}/start")
def start_transcription(
    project_id: int,
    options: TranscribeRequest,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

    # Create Job
    job_id = TranscriptionJobManager.create_job(project_id=project_id, options=options)

    # Run in background thread
    thread = threading.Thread(
        target=TranscriptionJobManager.run_transcription_pipeline,
        args=(job_id, project_id, options),
        daemon=True
    )
    thread.start()

    return {"job_id": job_id, "status": "started", "message": "Bắt đầu tạo phụ đề..."}

@router.get("/status/{job_id}")
def get_transcription_status(job_id: str):
    job = TranscriptionJobManager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tạo phụ đề")
    return job
