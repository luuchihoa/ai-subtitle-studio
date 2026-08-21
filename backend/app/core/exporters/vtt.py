from typing import List, Dict, Any

def format_vtt_timestamp(seconds: float) -> str:
    """
    Converts seconds float into WebVTT timestamp format: HH:MM:SS.mmm
    """
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        millis = 999
    return f"{hrs:02d}:{mins:02d}:{secs:02d}.{millis:03d}"

def export_to_vtt(segments: List[Dict[str, Any]], include_speakers: bool = False) -> str:
    """
    Exports subtitle segments to standard WebVTT format.
    """
    lines = ["WEBVTT\n"]
    for idx, seg in enumerate(segments, start=1):
        start_str = format_vtt_timestamp(seg.get("start_time", 0.0))
        end_str = format_vtt_timestamp(seg.get("end_time", 0.0))
        text = seg.get("text", "").strip()
        speaker = seg.get("speaker", "")

        voice_tag = f"<v {speaker}>" if include_speakers and speaker else ""
        close_tag = "</v>" if voice_tag else ""
        
        lines.append(f"{idx}")
        lines.append(f"{start_str} --> {end_str}")
        lines.append(f"{voice_tag}{text}{close_tag}\n")

    return "\n".join(lines)
