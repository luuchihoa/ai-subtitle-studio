import json
from typing import List, Dict, Any

def export_to_json(segments: List[Dict[str, Any]], metadata: Dict[str, Any] = None) -> str:
    """
    Exports full subtitle data structured in JSON with word-level timings and speakers.
    """
    data = {
        "metadata": metadata or {},
        "segment_count": len(segments),
        "segments": segments
    }
    return json.dumps(data, ensure_ascii=False, indent=2)
