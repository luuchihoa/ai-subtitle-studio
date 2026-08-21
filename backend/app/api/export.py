from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, PlainTextResponse
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.subtitle import Subtitle
from backend.app.models.project import Project
from backend.app.core.exporters import export_subtitles

router = APIRouter(prefix="/export", tags=["Export"])

@router.get("/{subtitle_id}")
def export_subtitle(
    subtitle_id: int,
    format: str = Query("srt", description="srt, vtt, ass, json, txt, fcpxml"),
    include_speakers: bool = Query(False),
    highlight_words: bool = Query(False),
    db: Session = Depends(get_db)
):
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy phụ đề")

    project = db.query(Project).filter(Project.id == sub.project_id).first()
    project_title = project.title if project else "subtitles"

    segments_data = [
        {
            "sequence_number": s.sequence_number,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "text": s.text,
            "speaker": s.speaker,
            "words": s.words or []
        }
        for s in sub.segments
    ]

    metadata = {
        "title": project_title,
        "language": sub.language,
        "media_type": project.media_type if project else "audio"
    }

    content = export_subtitles(
        segments=segments_data,
        format_type=format,
        include_speakers=include_speakers,
        highlight_words=highlight_words,
        metadata=metadata
    )

    # Determine Content-Type and Filename
    fmt = format.lower().strip()
    ext_map = {
        "srt": ("text/plain", "srt"),
        "vtt": ("text/vtt", "vtt"),
        "ass": ("text/x-ssa", "ass"),
        "json": ("application/json", "json"),
        "txt": ("text/plain", "txt"),
        "fcpxml": ("application/xml", "fcpxml")
    }

    content_type, ext = ext_map.get(fmt, ("text/plain", "srt"))
    filename = f"{project_title.replace(' ', '_')}_{sub.language}.{ext}"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"'
    }

    return Response(content=content, media_type=content_type, headers=headers)
