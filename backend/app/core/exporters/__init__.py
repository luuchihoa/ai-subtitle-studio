from typing import List, Dict, Any
from backend.app.core.exporters.srt import export_to_srt
from backend.app.core.exporters.vtt import export_to_vtt
from backend.app.core.exporters.ass import export_to_ass
from backend.app.core.exporters.json_export import export_to_json
from backend.app.core.exporters.txt import export_to_txt
from backend.app.core.exporters.fcpxml import export_to_fcpxml

def export_subtitles(
    segments: List[Dict[str, Any]],
    format_type: str = "srt",
    include_speakers: bool = False,
    highlight_words: bool = False,
    metadata: Dict[str, Any] = None
) -> str:
    """
    Unified export function supporting all standard subtitle formats.
    """
    fmt = format_type.lower().strip()
    if fmt == "srt":
        return export_to_srt(segments, include_speakers=include_speakers)
    elif fmt == "vtt":
        return export_to_vtt(segments, include_speakers=include_speakers)
    elif fmt == "ass":
        return export_to_ass(segments, highlight_words=highlight_words, include_speakers=include_speakers)
    elif fmt == "json":
        return export_to_json(segments, metadata=metadata)
    elif fmt == "txt":
        return export_to_txt(segments, include_timestamps=True, include_speakers=include_speakers)
    elif fmt in ("fcpxml", "xml"):
        return export_to_fcpxml(segments, title=metadata.get("title", "Subtitles") if metadata else "Subtitles")
    else:
        # Default fallback to SRT
        return export_to_srt(segments, include_speakers=include_speakers)

__all__ = [
    "export_subtitles", "export_to_srt", "export_to_vtt",
    "export_to_ass", "export_to_json", "export_to_txt", "export_to_fcpxml"
]
