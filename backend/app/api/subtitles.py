from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.subtitle import Subtitle, SubtitleSegment, Speaker
from backend.app.schemas.subtitle import (
    SubtitleResponse, SubtitleSegmentResponse, SubtitleSegmentCreate,
    SubtitleSegmentUpdate, BatchSegmentUpdate
)
from backend.app.schemas.transcribe import ReSegmentRequest, TranslateRequest
from backend.app.core.segmenter import SmartSubtitleSegmenter
from backend.app.core.translator import SubtitleTranslator

router = APIRouter(prefix="/subtitles", tags=["Subtitles"])

@router.get("/{subtitle_id}", response_model=SubtitleResponse)
def get_subtitle(subtitle_id: int, db: Session = Depends(get_db)):
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy phụ đề")
    return sub

@router.put("/segments/{segment_id}", response_model=SubtitleSegmentResponse)
def update_segment(
    segment_id: int,
    payload: SubtitleSegmentUpdate,
    db: Session = Depends(get_db)
):
    seg = db.query(SubtitleSegment).filter(SubtitleSegment.id == segment_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Không tìm thấy đoạn phụ đề")

    if payload.text is not None:
        seg.text = payload.text
    if payload.start_time is not None:
        seg.start_time = payload.start_time
    if payload.end_time is not None:
        seg.end_time = payload.end_time
    if payload.speaker is not None:
        seg.speaker = payload.speaker
    if payload.sequence_number is not None:
        seg.sequence_number = payload.sequence_number
    if payload.words is not None:
        seg.words = [w.dict() for w in payload.words]

    db.commit()
    db.refresh(seg)
    return seg

@router.post("/{subtitle_id}/segments", response_model=SubtitleSegmentResponse, status_code=status.HTTP_201_CREATED)
def create_segment(
    subtitle_id: int,
    payload: SubtitleSegmentCreate,
    db: Session = Depends(get_db)
):
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy phụ đề")

    seg = SubtitleSegment(
        subtitle_id=subtitle_id,
        sequence_number=payload.sequence_number,
        start_time=payload.start_time,
        end_time=payload.end_time,
        text=payload.text,
        speaker=payload.speaker or "Speaker 1",
        words=[w.dict() for w in payload.words] if payload.words else []
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return seg

@router.delete("/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_segment(segment_id: int, db: Session = Depends(get_db)):
    seg = db.query(SubtitleSegment).filter(SubtitleSegment.id == segment_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Không tìm thấy đoạn phụ đề")
    db.delete(seg)
    db.commit()
    return None

@router.put("/batch-update/{subtitle_id}")
def batch_update_segments(
    subtitle_id: int,
    payload: BatchSegmentUpdate,
    db: Session = Depends(get_db)
):
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy phụ đề")

    # Delete existing segments
    db.query(SubtitleSegment).filter(SubtitleSegment.subtitle_id == subtitle_id).delete()

    # Re-insert updated segments
    for idx, item in enumerate(payload.segments, start=1):
        db_seg = SubtitleSegment(
            subtitle_id=subtitle_id,
            sequence_number=idx,
            start_time=item.start_time,
            end_time=item.end_time,
            text=item.text,
            speaker=item.speaker or "Speaker 1",
            words=[w.dict() for w in item.words] if item.words else []
        )
        db.add(db_seg)

    db.commit()
    return {"message": "Cập nhật thành công", "count": len(payload.segments)}

@router.post("/{subtitle_id}/resegment", response_model=SubtitleResponse)
def resegment_subtitles(
    subtitle_id: int,
    payload: ReSegmentRequest,
    db: Session = Depends(get_db)
):
    """
    Re-segments the subtitle track using original word timestamps according to new CPL/CPS rules.
    """
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy phụ đề")

    # Extract all word timestamps from existing segments
    all_words = []
    for seg in sub.segments:
        if seg.words:
            all_words.extend(seg.words)

    if not all_words:
        # Re-segment based on raw text lines
        raw_segs = [{"text": s.text, "start": s.start_time, "end": s.end_time} for s in sub.segments]
        new_segs = SmartSubtitleSegmenter.re_segment_from_raw(
            raw_segs,
            max_cpl=payload.max_cpl,
            max_lines=payload.max_lines,
            min_duration=payload.min_duration,
            max_duration=payload.max_duration,
            max_cps=payload.max_cps
        )
    else:
        new_segs = SmartSubtitleSegmenter.segment_words(
            all_words,
            max_cpl=payload.max_cpl,
            max_lines=payload.max_lines,
            min_duration=payload.min_duration,
            max_duration=payload.max_duration,
            max_cps=payload.max_cps
        )

    # Replace existing segments with re-segmented ones
    db.query(SubtitleSegment).filter(SubtitleSegment.subtitle_id == subtitle_id).delete()
    for idx, s in enumerate(new_segs, start=1):
        db_seg = SubtitleSegment(
            subtitle_id=subtitle_id,
            sequence_number=idx,
            start_time=s["start_time"],
            end_time=s["end_time"],
            text=s["text"],
            speaker=s.get("speaker", "Speaker 1"),
            words=s.get("words", [])
        )
        db.add(db_seg)

    db.commit()
    db.refresh(sub)
    return sub

@router.post("/{subtitle_id}/translate", response_model=SubtitleResponse)
def translate_subtitle_track(
    subtitle_id: int,
    payload: TranslateRequest,
    db: Session = Depends(get_db)
):
    """
    Translates an entire subtitle track to a target language and creates a new track.
    """
    source_sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not source_sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy phụ đề nguồn")

    segments_data = [
        {
            "sequence_number": s.sequence_number,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "text": s.text,
            "speaker": s.speaker,
            "words": s.words
        }
        for s in source_sub.segments
    ]

    translated_segments = SubtitleTranslator.translate_segments(
        segments_data,
        target_lang=payload.target_language,
        source_lang=payload.source_language or source_sub.language
    )

    # Create new Subtitle track
    new_sub = Subtitle(
        project_id=source_sub.project_id,
        language=payload.target_language,
        label=f"Bản dịch ({payload.target_language.upper()})",
        is_primary=False
    )
    db.add(new_sub)
    db.flush()

    for idx, s in enumerate(translated_segments, start=1):
        db_seg = SubtitleSegment(
            subtitle_id=new_sub.id,
            sequence_number=idx,
            start_time=s["start_time"],
            end_time=s["end_time"],
            text=s["text"],
            speaker=s.get("speaker", "Speaker 1"),
            words=[]
        )
        db.add(db_seg)

    db.commit()
    db.refresh(new_sub)
    return new_sub
