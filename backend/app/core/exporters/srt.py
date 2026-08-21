from typing import List, Dict, Any

def format_srt_timestamp(seconds: float) -> str:
    """
    Converts seconds float into SRT timestamp format: HH:MM:SS,mmm
    """
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        millis = 999
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

def export_to_srt(segments: List[Dict[str, Any]], include_speakers: bool = False) -> str:
    """
    Exports subtitle segments to a valid SRT string.
    """
    blocks = []
    for idx, seg in enumerate(segments, start=1):
        start_str = format_srt_timestamp(seg.get("start_time", 0.0))
        end_str = format_srt_timestamp(seg.get("end_time", 0.0))
        text = seg.get("text", "").strip()
        speaker = seg.get("speaker", "")

        content = f"[{speaker}] {text}" if include_speakers and speaker else text
        blocks.append(f"{idx}\n{start_str} --> {end_str}\n{content}\n")

    return "\n".join(blocks)
