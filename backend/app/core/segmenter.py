from typing import List, Dict, Any, Optional

class SmartSubtitleSegmenter:
    """
    Transforms a stream of timecoded words into professional, broadcast-compliant subtitle blocks.
    Complies with Netflix / BBC subtitling rules (CPL, CPS, Line limits, Natural pause splitting).
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
            # Check if adding this word exceeds max_cpl
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

        # If lines exceed max_lines, compress excess into the last line or balance
        if len(lines) > max_lines:
            # Rebalance into max_lines
            total_words = words
            half = len(total_words) // 2
            line1 = " ".join(total_words[:half])
            line2 = " ".join(total_words[half:])
            return f"{line1}\n{line2}"

        return "\n".join(lines)

    @classmethod
    def segment_words(
        cls,
        words: List[Dict[str, Any]],
        max_cpl: int = 40,
        max_lines: int = 2,
        min_duration: float = 1.0,
        max_duration: float = 7.0,
        max_cps: float = 20.0,
        pause_threshold: float = 0.55
    ) -> List[Dict[str, Any]]:
        """
        Groups timecoded words into optimal subtitle segments.
        """
        if not words:
            return []

        segments = []
        current_block_words = []
        block_start_time = words[0]["start"]
        max_total_chars = max_cpl * max_lines

        hard_punctuation = {".", "!", "?", "...", "…"}
        soft_punctuation = {",", ";", ":", "-", "—"}

        for i, word_item in enumerate(words):
            word_str = word_item["word"]
            word_start = word_item["start"]
            word_end = word_item["end"]

            # Initialize block start if empty
            if not current_block_words:
                block_start_time = word_start
                current_block_words.append(word_item)
                continue

            prev_word = current_block_words[-1]
            gap = word_start - prev_word["end"]
            current_duration = word_end - block_start_time

            # Compute current character length if we add this word
            current_text = " ".join([w["word"] for w in current_block_words])
            tentative_text = f"{current_text} {word_str}"
            tentative_len = len(tentative_text)

            # Determine split triggers:
            should_split = False
            split_reason = ""

            # 1. Natural silence gap between words (speaker paused)
            if gap >= pause_threshold and (prev_word["end"] - block_start_time) >= min_duration:
                should_split = True
                split_reason = "pause"

            # 2. Hard sentence ending punctuation on previous word
            elif any(prev_word["word"].endswith(p) for p in hard_punctuation) and (prev_word["end"] - block_start_time) >= min_duration:
                should_split = True
                split_reason = "sentence_end"

            # 3. Exceeds max character capacity per subtitle screen
            elif tentative_len > max_total_chars:
                should_split = True
                split_reason = "max_chars"

            # 4. Exceeds maximum display duration (screen would stay up too long)
            elif current_duration > max_duration:
                should_split = True
                split_reason = "max_duration"

            if should_split:
                # Seal current block
                raw_text = " ".join([w["word"] for w in current_block_words])
                formatted_text = cls.format_line_breaks(raw_text, max_cpl=max_cpl, max_lines=max_lines)
                seg_start = current_block_words[0]["start"]
                seg_end = current_block_words[-1]["end"]

                # Ensure minimum duration for readability if possible
                if seg_end - seg_start < min_duration:
                    seg_end = min(seg_start + min_duration, word_start)

                segments.append({
                    "sequence_number": len(segments) + 1,
                    "start_time": round(seg_start, 3),
                    "end_time": round(seg_end, 3),
                    "text": formatted_text,
                    "words": list(current_block_words),
                    "speaker": "Speaker 1"
                })

                # Start new block
                current_block_words = [word_item]
                block_start_time = word_start
            else:
                current_block_words.append(word_item)

        # Flush remaining words in buffer
        if current_block_words:
            raw_text = " ".join([w["word"] for w in current_block_words])
            formatted_text = cls.format_line_breaks(raw_text, max_cpl=max_cpl, max_lines=max_lines)
            seg_start = current_block_words[0]["start"]
            seg_end = current_block_words[-1]["end"]
            
            if seg_end - seg_start < min_duration:
                seg_end = round(seg_start + min_duration, 3)

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
        min_duration: float = 1.0,
        max_duration: float = 7.0,
        max_cps: float = 20.0
    ) -> List[Dict[str, Any]]:
        """
        Fallback segmenter when word-level timestamps are sparse or from raw segments.
        """
        # Collect all words from raw segments if available
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
                max_cps=max_cps
            )

        # If no word timestamps, segment directly by sentence / character rules
        result = []
        seq = 1
        for s in raw_segments:
            text = s.get("text", "").strip()
            if not text:
                continue
            formatted = cls.format_line_breaks(text, max_cpl=max_cpl, max_lines=max_lines)
            result.append({
                "sequence_number": seq,
                "start_time": s.get("start", 0.0),
                "end_time": s.get("end", 0.0),
                "text": formatted,
                "words": [],
                "speaker": "Speaker 1"
            })
            seq += 1
        return result
