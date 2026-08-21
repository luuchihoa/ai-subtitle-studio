import os
import time
from typing import List, Dict, Any, Optional, Callable
from faster_whisper import WhisperModel
from backend.app.config import settings

class AudioTranscriber:
    _cached_models: Dict[str, WhisperModel] = {}

    @classmethod
    def get_model(cls, model_size: str = "base", device: str = "auto", compute_type: str = "default") -> WhisperModel:
        """
        Loads and caches Whisper model instances for faster subsequent inference.
        """
        key = f"{model_size}_{device}_{compute_type}"
        if key not in cls._cached_models:
            # Auto-detect device if auto
            actual_device = "cpu"
            actual_compute_type = "int8"
            
            # Faster-whisper on CPU works best with int8
            try:
                model = WhisperModel(model_size, device=actual_device, compute_type=actual_compute_type)
            except Exception:
                # Fallback to float32 if int8 is not supported
                model = WhisperModel(model_size, device=actual_device, compute_type="float32")
            
            cls._cached_models[key] = model
            
        return cls._cached_models[key]

    @classmethod
    def transcribe(
        cls,
        audio_path: str,
        model_size: str = "base",
        language: Optional[str] = None,
        enable_vad: bool = True,
        enable_word_timestamps: bool = True,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Any]:
        """
        Transcribes audio with high-precision word-level timestamps and VAD filtering.
        """
        if progress_callback:
            progress_callback(10.0, f"Đang nạp mô hình Whisper ({model_size})...")

        model = cls.get_model(model_size=model_size)

        if progress_callback:
            progress_callback(25.0, "Đang giải mã âm thanh và phân tích giọng nói...")

        vad_parameters = dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200
        ) if enable_vad else None

        segments_generator, info = model.transcribe(
            audio_path,
            language=language if language and language != "auto" else None,
            vad_filter=enable_vad,
            vad_parameters=vad_parameters,
            word_timestamps=enable_word_timestamps,
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            beam_size=5,
            best_of=5,
            condition_on_previous_text=False  # Reduces repetition/hallucination loops
        )

        detected_language = info.language
        language_probability = info.language_probability
        duration = info.duration

        raw_segments = []
        all_words = []

        total_duration = max(duration, 1.0)
        
        for seg in segments_generator:
            words_data = []
            if seg.words:
                for w in seg.words:
                    word_obj = {
                        "word": w.word.strip(),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3)
                    }
                    if word_obj["word"]:  # Ignore empty tokens
                        words_data.append(word_obj)
                        all_words.append(word_obj)

            segment_dict = {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "words": words_data
            }
            raw_segments.append(segment_dict)

            # Update progress based on current audio time
            if progress_callback and duration > 0:
                current_pct = min(85.0, 25.0 + (seg.end / total_duration) * 60.0)
                progress_callback(current_pct, f"Đang nhận diện: {round(seg.end, 1)}s / {round(duration, 1)}s")

        return {
            "language": detected_language,
            "language_probability": round(language_probability, 3),
            "duration": duration,
            "raw_segments": raw_segments,
            "all_words": all_words
        }
