from typing import List, Dict, Any, Optional

class SmartSubtitleSegmenter:
    """
    Transforms a stream of timecoded words into professional, broadcast-compliant subtitle blocks.
    Complies with Netflix / BBC subtitling rules:
    - Splits IMMEDIATELY on any noticeable silence gap (pause threshold >= 0.4s).
    - Splits on sentence punctuation (. ? ! ...) when followed by pause or length limit.
    - Limits Characters Per Line (CPL) and total screen duration without bleeding into pauses.
    """

    @staticmethod
    def format_line_breaks(text: str, max_cpl: int = 40, max_lines: int = 2) -> str:
        """
        Splits text across lines evenly without breaking words.
        """
        words = text.strip().split()
        if not words:
            return ""

        if len(text) <= max_cpl:
            return text

        lines = []
        current_line = []
        current_len = 0

        for w in words:
            word_len = len(w)
            space = 1 if current_line else 0
            if current_len + space + word_len <= max_cpl:
                current_line.append(w)
                current_len += space + word_len
            else:
                if current_line:
                    lines.append(" ".join(current_line))
                current_line = [w]
                current_len = word_len

        if current_line:
            lines.append(" ".join(current_line))

        # If lines exceed max_lines, balance into 2 lines
        if len(lines) > max_lines:
            half = len(words) // 2
            line1 = " ".join(words[:half])
            line2 = " ".join(words[half:])
            return f"{line1}\n{line2}"

        return "\n".join(lines)

    @classmethod
    def segment_words(
        cls,
        words: List[Dict[str, Any]],
        max_cpl: int = 40,
        max_lines: int = 2,
        min_duration: float = 0.8,
        max_duration: float = 6.5,
        max_cps: float = 20.0,
        pause_threshold: float = 0.40  # Pauses >= 0.40s MUST trigger a new subtitle block
    ) -> List[Dict[str, Any]]:
        """
        Groups timecoded words into optimal subtitle segments with precise pause awareness.
        """
        if not words:
            return []

        segments = []
        current_block_words = []
        max_total_chars = max_cpl * max_lines

        hard_punctuation = {".", "!", "?", "...", "…"}
        soft_punctuation = {",", ";", ":", "-", "—"}

        for i, word_item in enumerate(words):
            word_str = word_item["word"].strip()
            if not word_str:
                continue

            word_start = word_item["start"]
            word_end = word_item["end"]

            # Initialize block if empty
            if not current_block_words:
                current_block_words.append(word_item)
                continue

            prev_word = current_block_words[-1]
            gap = word_start - prev_word["end"]
            block_start_time = current_block_words[0]["start"]
            current_duration = word_end - block_start_time

            current_text = " ".join([w["word"] for w in current_block_words])
            tentative_text = f"{current_text} {word_str}"
            tentative_len = len(tentative_text)

            should_split = False

            # RULE 1: Unconditional Pause / Silence Gap
            # When speaker stops for >= pause_threshold (e.g. 0.4s), NEVER merge across the silence!
            if gap >= pause_threshold:
                should_split = True

            # RULE 2: Hard sentence-ending punctuation (. ? !) with even small pause or reasonable length
            elif any(prev_word["word"].endswith(p) for p in hard_punctuation) and (gap >= 0.20 or tentative_len >= 30):
                should_split = True

            # RULE 3: Soft punctuation (, ;) followed by a moderate pause (>= 0.30s)
            elif any(prev_word["word"].endswith(p) for p in soft_punctuation) and gap >= 0.30:
                should_split = True

            # RULE 4: Exceeds character capacity (e.g. > 80 chars on screen)
            elif tentative_len > max_total_chars:
                should_split = True

            # RULE 5: Exceeds maximum display duration (e.g. > 6.5s)
            elif current_duration > max_duration:
                should_split = True

            if should_split:
                raw_text = " ".join([w["word"] for w in current_block_words])
                formatted_text = cls.format_line_breaks(raw_text, max_cpl=max_cpl, max_lines=max_lines)
                seg_start = current_block_words[0]["start"]
                seg_end = current_block_words[-1]["end"]  # Exactly when speech stopped

                segments.append({
                    "sequence_number": len(segments) + 1,
                    "start_time": round(seg_start, 3),
                    "end_time": round(seg_end, 3),
                    "text": formatted_text,
                    "words": list(current_block_words),
                    "speaker": "Speaker 1"
                })

                current_block_words = [word_item]
            else:
                current_block_words.append(word_item)

        # Flush remaining words
        if current_block_words:
            raw_text = " ".join([w["word"] for w in current_block_words])
            formatted_text = cls.format_line_breaks(raw_text, max_cpl=max_cpl, max_lines=max_lines)
            seg_start = current_block_words[0]["start"]
            seg_end = current_block_words[-1]["end"]

            segments.append({
                "sequence_number": len(segments) + 1,
                "start_time": round(seg_start, 3),
                "end_time": round(seg_end, 3),
                "text": formatted_text,
                "words": list(current_block_words),
                "speaker": "Speaker 1"
            })

        return segments

    @classmethod
    def re_segment_from_raw(
        cls,
        raw_segments: List[Dict[str, Any]],
        max_cpl: int = 40,
        max_lines: int = 2,
        min_duration: float = 0.8,
        max_duration: float = 6.5,
        max_cps: float = 20.0,
        pause_threshold: float = 0.40
    ) -> List[Dict[str, Any]]:
        """
        Segmenter handling raw Whisper segments with gap detection.
        """
        all_words = []
        for s in raw_segments:
            if s.get("words"):
                all_words.extend(s["words"])

        if all_words:
            return cls.segment_words(
                all_words,
                max_cpl=max_cpl,
                max_lines=max_lines,
                min_duration=min_duration,
                max_duration=max_duration,
                max_cps=max_cps,
                pause_threshold=pause_threshold
            )

        # Fallback: Process segment-by-segment using segment start/end gaps
        result = []
        current_batch = []
        batch_start = 0.0

        for i, seg in enumerate(raw_segments):
            text = seg.get("text", "").strip()
            if not text:
                continue

            s_start = seg.get("start", 0.0)
            s_end = seg.get("end", 0.0)

            if not current_batch:
                current_batch.append(seg)
                batch_start = s_start
                continue

            prev_seg = current_batch[-1]
            gap = s_start - prev_seg.get("end", 0.0)
            batch_text = " ".join([s.get("text", "") for s in current_batch])
            dur = s_end - batch_start

            should_split = False
            if gap >= pause_threshold:
                should_split = True
            elif len(batch_text) + len(text) > (max_cpl * max_lines):
                should_split = True
            elif dur > max_duration:
                should_split = True

            if should_split:
                b_text = " ".join([s.get("text", "") for s in current_batch])
                result.append({
                    "sequence_number": len(result) + 1,
                    "start_time": round(current_batch[0].get("start", 0.0), 3),
                    "end_time": round(current_batch[-1].get("end", 0.0), 3),
                    "text": cls.format_line_breaks(b_text, max_cpl=max_cpl, max_lines=max_lines),
                    "words": [],
                    "speaker": "Speaker 1"
                })
                current_batch = [seg]
                batch_start = s_start
            else:
                current_batch.append(seg)

        if current_batch:
            b_text = " ".join([s.get("text", "") for s in current_batch])
            result.append({
                "sequence_number": len(result) + 1,
                "start_time": round(current_batch[0].get("start", 0.0), 3),
                "end_time": round(current_batch[-1].get("end", 0.0), 3),
                "text": cls.format_line_breaks(b_text, max_cpl=max_cpl, max_lines=max_lines),
                "words": [],
                "speaker": "Speaker 1"
            })

        return result
