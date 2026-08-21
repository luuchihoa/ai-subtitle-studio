import random
from typing import List, Dict, Any, Optional, Tuple

SPEAKER_PALETTE = [
    "#3B82F6",  # Blue
    "#10B981",  # Emerald
    "#F59E0B",  # Amber
    "#EC4899",  # Pink
    "#8B5CF6",  # Purple
    "#06B6D4",  # Cyan
    "#EF4444",  # Red
    "#84CC16",  # Lime
]

class SpeakerDiarizationEngine:
    """
    Handles speaker identification, grouping, and color assignment.
    """

    @classmethod
    def assign_default_speakers(
        cls,
        segments: List[Dict[str, Any]],
        num_speakers: Optional[int] = None
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Assigns speaker IDs to segments based on pause duration and alternating speech turns.
        """
        if not segments:
            return [], []

        speaker_names = {}
        current_speaker_idx = 1
        max_speakers = num_speakers or 2

        speaker_list = []
        for i in range(1, max_speakers + 1):
            speaker_list.append({
                "name": f"Speaker {i}",
                "color": SPEAKER_PALETTE[(i - 1) % len(SPEAKER_PALETTE)]
            })

        for i, seg in enumerate(segments):
            # Check pause gap with previous segment
            if i > 0:
                prev_seg = segments[i - 1]
                gap = seg["start_time"] - prev_seg["end_time"]
                # Long pause (>1.2s) often indicates a speaker transition
                if gap > 1.2 and max_speakers > 1:
                    current_speaker_idx = (current_speaker_idx % max_speakers) + 1

            seg["speaker"] = f"Speaker {current_speaker_idx}"

        return segments, speaker_list
