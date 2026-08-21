from typing import List, Dict, Any

def format_simple_timestamp(seconds: float) -> str:
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

def export_to_txt(segments: List[Dict[str, Any]], include_timestamps: bool = True, include_speakers: bool = True) -> str:
    """
    Exports clean plain text transcript.
    """
    lines = []
    for seg in segments:
        text = seg.get("text", "").replace("\n", " ")
        speaker = seg.get("speaker", "")
        start_str = format_simple_timestamp(seg.get("start_time", 0.0))

        prefix = ""
        if include_timestamps and include_speakers and speaker:
            prefix = f"[{start_str}] {speaker}: "
        elif include_timestamps:
            prefix = f"[{start_str}] "
        elif include_speakers and speaker:
            prefix = f"{speaker}: "

        lines.append(f"{prefix}{text}")

    return "\n\n".join(lines)
