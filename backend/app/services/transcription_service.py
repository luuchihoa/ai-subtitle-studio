import os
import uuid
import threading
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.models.project import Project
from backend.app.models.subtitle import Subtitle, SubtitleSegment, Speaker
from backend.app.core.audio import extract_and_convert_audio, get_media_info, generate_waveform_peaks
from backend.app.core.transcriber import AudioTranscriber
from backend.app.core.segmenter import SmartSubtitleSegmenter
from backend.app.core.postprocessor import SubtitlePostProcessor
from backend.app.core.diarization import SpeakerDiarizationEngine, SPEAKER_PALETTE
from backend.app.schemas.transcribe import TranscribeRequest

class TranscriptionJobManager:
    _jobs: Dict[str, Dict[str, Any]] = {}
    _lock = threading.Lock()

    @classmethod
    def create_job(cls, project_id: int, options: TranscribeRequest) -> str:
        job_id = str(uuid.uuid4())
        with cls._lock:
            cls._jobs[job_id] = {
                "id": job_id,
                "project_id": project_id,
                "status": "pending",
                "progress": 0.0,
                "message": "Đang khởi tạo tác vụ...",
                "error": None
            }
        return job_id

    @classmethod
    def get_job(cls, job_id: str) -> Optional[Dict[str, Any]]:
        with cls._lock:
            return cls._jobs.get(job_id)

    @classmethod
    def update_job(cls, job_id: str, status: str, progress: float, message: str, error: Optional[str] = None):
        with cls._lock:
            if job_id in cls._jobs:
                cls._jobs[job_id]["status"] = status
                cls._jobs[job_id]["progress"] = progress
                cls._jobs[job_id]["message"] = message
                cls._jobs[job_id]["error"] = error

    @classmethod
    def run_transcription_pipeline(cls, job_id: str, project_id: int, options: TranscribeRequest):
        """
        Full end-to-end transcription pipeline running in a worker thread.
        """
        db: Session = SessionLocal()
        try:
            cls.update_job(job_id, "processing", 5.0, "Đang tải file dự án...")
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                cls.update_job(job_id, "failed", 0.0, "Không tìm thấy dự án", error="Project not found")
                return

            original_path = project.file_path
            wav_path = str(settings.UPLOAD_DIR / f"project_{project.id}_16k.wav")

            # Step 1: Audio Extraction & Conversion
            cls.update_job(job_id, "processing", 10.0, "Đang trích xuất & tối ưu âm thanh (16kHz)...")
            if not os.path.exists(wav_path):
                extract_and_convert_audio(original_path, wav_path)

            # Step 2: Extract Waveform peaks if not already present
            if not project.waveform_data:
                cls.update_job(job_id, "processing", 15.0, "Đang tính toán biểu đồ sóng âm thanh...")
                peaks = generate_waveform_peaks(wav_path)
                project.waveform_data = peaks
                
                # Check media info
                info = get_media_info(original_path)
                project.duration = info.get("duration", project.duration)
                project.media_type = "video" if info.get("is_video") else "audio"
                db.commit()

            # Step 3: Transcription with Faster-Whisper
            def progress_cb(pct: float, msg: str):
                cls.update_job(job_id, "processing", pct, msg)

            transcription_result = AudioTranscriber.transcribe(
                audio_path=wav_path,
                model_size=options.model_size,
                language=options.language,
                enable_vad=options.enable_vad,
                enable_word_timestamps=options.enable_word_timestamps,
                progress_callback=progress_cb
            )

            # Step 4: Smart Subtitle Segmentation
            cls.update_job(job_id, "processing", 88.0, "Đang chuẩn hóa phân đoạn phụ đề (CPL, CPS)...")
            all_words = transcription_result.get("all_words", [])
            raw_segments = transcription_result.get("raw_segments", [])

            if all_words:
                structured_segments = SmartSubtitleSegmenter.segment_words(
                    words=all_words,
                    max_cpl=options.max_cpl,
                    max_lines=options.max_lines,
                    min_duration=options.min_duration,
                    max_duration=options.max_duration,
                    max_cps=options.max_cps
                )
            else:
                structured_segments = SmartSubtitleSegmenter.re_segment_from_raw(
                    raw_segments=raw_segments,
                    max_cpl=options.max_cpl,
                    max_lines=options.max_lines,
                    min_duration=options.min_duration,
                    max_duration=options.max_duration,
                    max_cps=options.max_cps
                )

            # Step 5: Post-Processing (Punctuation, Hallucination Removal, Fillers)
            cls.update_job(job_id, "processing", 92.0, "Đang tinh chỉnh dấu câu & lọc từ nhiễu...")
            detected_lang = transcription_result.get("language", "vi")
            cleaned_segments = SubtitlePostProcessor.process_segments(
                segments=structured_segments,
                filter_hallucinations=options.filter_hallucinations,
                remove_fillers=options.remove_fillers,
                language=detected_lang
            )

            # Step 6: Speaker Diarization / Assignment
            cls.update_job(job_id, "processing", 95.0, "Đang định danh người nói...")
            assigned_segments, speaker_list = SpeakerDiarizationEngine.assign_default_speakers(
                segments=cleaned_segments,
                num_speakers=options.num_speakers if options.enable_diarization else 1
            )

            # Step 7: Database Storage
            cls.update_job(job_id, "processing", 98.0, "Đang lưu trữ dữ liệu phụ đề...")

            # Clean previous primary subtitles if any
            existing_subs = db.query(Subtitle).filter(
                Subtitle.project_id == project.id,
                Subtitle.is_primary == True
            ).all()
            for s in existing_subs:
                db.delete(s)

            # Add speakers to project if not exist
            for spk in speaker_list:
                existing_spk = db.query(Speaker).filter(
                    Speaker.project_id == project.id,
                    Speaker.name == spk["name"]
                ).first()
                if not existing_spk:
                    new_spk = Speaker(
                        project_id=project.id,
                        name=spk["name"],
                        color=spk["color"]
                    )
                    db.add(new_spk)

            # Create Subtitle record
            subtitle_record = Subtitle(
                project_id=project.id,
                language=detected_lang,
                label=f"Gốc ({detected_lang.upper()})",
                is_primary=True
            )
            db.add(subtitle_record)
            db.flush()

            # Insert Segments
            for idx, seg in enumerate(assigned_segments, start=1):
                db_seg = SubtitleSegment(
                    subtitle_id=subtitle_record.id,
                    sequence_number=idx,
                    start_time=seg["start_time"],
                    end_time=seg["end_time"],
                    text=seg["text"],
                    speaker=seg.get("speaker", "Speaker 1"),
                    words=seg.get("words", [])
                )
                db.add(db_seg)

            db.commit()
            cls.update_job(job_id, "completed", 100.0, "Tạo phụ đề hoàn tất thành công!")

        except Exception as e:
            db.rollback()
            print(f"Pipeline error: {e}")
            cls.update_job(job_id, "failed", 0.0, f"Lỗi xử lý: {str(e)}", error=str(e))
        finally:
            db.close()
