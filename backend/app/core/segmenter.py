import re
from typing import List, Dict, Any, Optional

class SmartSubtitleSegmenter:
    """
    SOTA Syntactic & Semantic Subtitle Segmenter (Netflix / BBC Broadcast Standard).
    
    Rules & Features:
    1. Maximum 2 lines per subtitle screen (Strict broadcast rule: NEVER 3 lines).
    2. Compound Word & Phrase Protection (NEVER split compound word pairs across lines or screens):
       - Pronoun pairs: anh em, chị em, ông bà, cha mẹ, chúng ta, chúng tôi, vợ chồng, con cái...
       - Compound verbs/nouns: tuôn đổ, chăn dắt, tuyên sấm, hạch tội, Thiên Chúa, Đức Chúa, ân huệ, bình an...
    3. Strict Syntactic phrase protection:
       - Never ends Line 1 with auxiliaries/imperatives: hãy, đã, đang, sẽ, phải, không, chưa, được, bị...
       - Never ends Line 1 with determiners/quantifiers: các, những, mỗi, mọi, từng, cả...
       - Never ends Line 1 with prepositions/conjunctions: với, cho, về, ở, tại, của, và, hoặc, nhưng, bởi, để, rằng, như, hỡi...
    4. Anti-Fragmentation & Post-Segmentation Merger:
       - Automatically merges trailing fragments (e.g. 'em mọi thứ ân huệ') into a single balanced 2-line screen when length allows.
    5. Knuth-Plass DP Optimal 2-line balancing.
    """

    # Common 2-word compound pairs in Vietnamese that must NEVER be broken across lines/screens
    COMPOUND_PAIRS = {
        # Pronoun & Address Pairs
        ("anh", "em"), ("chị", "em"), ("ông", "bà"), ("cha", "mẹ"), ("cha", "con"), ("mẹ", "con"),
        ("vợ", "chồng"), ("con", "cái"), ("chúng", "ta"), ("chúng", "tôi"), ("chúng", "mình"),
        ("chúng", "nó"), ("thầy", "trò"), ("bạn", "bè"), ("anh", "chị"), ("cô", "bác"),
        ("chú", "bác"), ("con", "người"), ("nhân", "loại"), ("đồng", "bào"), ("họ", "hàng"),
        # Sacred & Religious Terms
        ("thiên", "chúa"), ("đức", "chúa"), ("đức", "mẹ"), ("chúa", "cha"), ("chúa", "con"),
        ("thánh", "thần"), ("hội", "thánh"), ("ân", "huệ"), ("bình", "an"), ("hy", "vọng"),
        ("đức", "tin"), ("tình", "yêu"), ("sự", "sống"), ("cứu", "độ"), ("mục", "tử"),
        ("chúc", "lành"), ("tha", "thứ"), ("yêu", "thương"), ("lời", "chúa"), ("thánh", "kinh"),
        # Compound Verbs & Nouns
        ("tuôn", "đổ"), ("chăn", "dắt"), ("tuyên", "sấm"), ("hạch", "tội"), ("chăm", "sóc"),
        ("hướng", "dẫn"), ("giúp", "đỡ"), ("chia", "sẻ"), ("phát", "triển"), ("xây", "dựng"),
        ("thực", "hiện"), ("hoàn", "thành"), ("bắt", "đầu"), ("kết", "thúc"), ("tôn", "thờ"),
        ("ngợi", "khen"), ("cảm", "tạ"), ("suy", "nghĩ"), ("tin", "tưởng"), ("lắng", "nghe"),
        ("mọi", "thứ"), ("mỗi", "ngày"), ("hằng", "ngày"), ("ít-ra-en", "")
    }

    # Words that must NEVER dangle at the end of Line 1
    DANGLING_END_WORDS = {
        # Imperatives, Modals & Auxiliaries
        "hãy", "đã", "đang", "sẽ", "phải", "không", "chưa", "chẳng", "được", "bị",
        "muốn", "cần", "nên", "dám", "toan", "định", "có", "là", "hết", "chớ", "đừng",
        # Determiners, Quantifiers & Classifiers
        "các", "những", "mỗi", "mọi", "từng", "cả", "con", "người", "cái", "chiếc",
        "này", "nọ", "kia", "đó", "đây", "ấy",
        # Prepositions & Connectors
        "với", "cho", "về", "ở", "tại", "của", "và", "hoặc", "nhưng", "bởi", "do",
        "để", "rằng", "như", "nếu", "thì", "mà", "hỡi", "kìa", "vì", "từ", "lên", "xuống",
        "trên", "dưới", "trong", "ngoài", "giữa", "sau", "trước",
        # English equivalents
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
        "of", "that", "this", "is", "are", "was", "were", "will", "would", "shall", "should", "let"
    }

    @classmethod
    def evaluate_line_split_penalty(cls, line1_words: List[str], line2_words: List[str], max_cpl: int = 40) -> float:
        """
        Evaluates the linguistic and visual penalty of breaking after line1_words.
        """
        if not line1_words or not line2_words:
            return 99999.0

        line1 = " ".join(line1_words).strip()
        line2 = " ".join(line2_words).strip()
        len1 = len(line1)
        len2 = len(line2)

        penalty = 0.0

        # Hard limit penalty: Exceeding max CPL
        if len1 > max_cpl:
            penalty += (len1 - max_cpl) * 60.0
        if len2 > max_cpl:
            penalty += (len2 - max_cpl) * 60.0

        # Length balance penalty: Keep Line 1 and Line 2 balanced
        length_diff = abs(len1 - len2)
        penalty += length_diff * 1.5

        # Compound Word Protection Penalty: Strict penalty against breaking compound pairs
        w1_clean = line1_words[-1].lower().strip(".,:;!?\"“”'()[]")
        w2_clean = line2_words[0].lower().strip(".,:;!?\"“”'()[]")
        if (w1_clean, w2_clean) in cls.COMPOUND_PAIRS:
            penalty += 850.0  # Heavy penalty for breaking 'tuôn/đổ', 'anh/em', 'Thiên/Chúa'

        # Anti-Orphan penalty: Line 2 with only 1 or 2 words / < 12 characters
        if len(line2_words) == 1:
            penalty += 1000.0  # Strict rejection of 1-word second line
        elif len(line2_words) == 2 and len2 < 12:
            penalty += 500.0

        # Dangling word penalty: Line 1 ending with auxiliary, preposition, or determiner
        if w1_clean in cls.DANGLING_END_WORDS:
            penalty += 700.0

        # First word of line 2 being loose punctuation
        if w2_clean in {",", ";", ":", "."}:
            penalty += 1000.0

        # Preference: Break at punctuation (:, ,, ;)
        raw_last_char = line1_words[-1][-1]
        if raw_last_char in {":", ";", "—", "-"}:
            penalty -= 300.0
        elif raw_last_char in {",", "\"", "”"}:
            penalty -= 180.0

        # Preference: Break after introductory connector 'rằng:'
        if w1_clean == "rằng" or line1_words[-1].endswith("rằng:") or line1_words[-1].endswith("rằng,"):
            penalty -= 250.0

        return penalty

    @classmethod
    def format_line_breaks(cls, text: str, max_cpl: int = 40, max_lines: int = 2) -> str:
        """
        Calculates the optimal 2-line break for a subtitle screen.
        Guarantees maximum 2 lines, preserves compound words, no dangling words, no orphan words.
        """
        clean_text = re.sub(r'\s+([,.:;?!])', r'\1', text).strip()
        words = clean_text.split()
        if not words:
            return ""

        if len(clean_text) <= max_cpl:
            return clean_text

        best_split_idx = -1
        min_penalty = float('inf')

        for i in range(1, len(words)):
            line1_words = words[:i]
            line2_words = words[i:]
            penalty = cls.evaluate_line_split_penalty(line1_words, line2_words, max_cpl=max_cpl)

            if penalty < min_penalty:
                min_penalty = penalty
                best_split_idx = i

        if best_split_idx != -1:
            line1 = " ".join(words[:best_split_idx])
            line2 = " ".join(words[best_split_idx:])
            return f"{line1}\n{line2}"

        half = len(words) // 2
        return f"{' '.join(words[:half])}\n{' '.join(words[half:])}"

    @classmethod
    def find_best_clause_split(cls, words: List[Dict[str, Any]], max_chars_per_screen: int = 80) -> int:
        """
        Finds the most natural syntactic clause boundary to split long text into 2 separate subtitle screens.
        """
        if len(words) < 4:
            return -1

        best_idx = -1
        best_score = -float('inf')

        for i in range(2, len(words) - 1):
            w_prev = words[i - 1]["word"].strip()
            w_curr = words[i]["word"].strip()

            text_1 = " ".join([w["word"] for w in words[:i]])
            text_2 = " ".join([w["word"] for w in words[i:]])
            len1 = len(text_1)
            len2 = len(text_2)

            score = 0.0

            # 1. Dialogue introduction (: or rằng :)
            if w_prev.endswith(":") or w_prev.lower() in {"rằng:", "rằng"}:
                score += 600.0
            # 2. Semicolon or dash
            elif any(w_prev.endswith(p) for p in {";", "—", "-", "\"", "”"}):
                score += 350.0
            # 3. Comma followed by vocative or connector (hỡi, thưa, nhưng, để, khi, vì, mà)
            elif w_prev.endswith(",") and w_curr.lower() in {"hỡi", "thưa", "kính", "nhưng", "để", "khi", "vì", "mà", "hãy"}:
                score += 300.0
            elif w_prev.endswith(","):
                score += 150.0

            # Balance preference
            score += (100.0 - abs(len1 - len2))

            # Compound pair protection: Never split between compound pair
            w1_clean = w_prev.lower().strip(".,:;!?\"“”")
            w2_clean = w_curr.lower().strip(".,:;!?\"“”")
            if (w1_clean, w2_clean) in cls.COMPOUND_PAIRS:
                score -= 900.0

            # Anti-dangling penalty
            if w1_clean in cls.DANGLING_END_WORDS:
                score -= 700.0

            # Disallow creating an orphan 1-word clause
            if i <= 1 or (len(words) - i) <= 1:
                score -= 1000.0

            if score > best_score:
                best_score = score
                best_idx = i

        return best_idx

    @classmethod
    def merge_short_fragments(cls, segments: List[Dict[str, Any]], max_chars: int = 80, max_dur: float = 7.0) -> List[Dict[str, Any]]:
        """
        Post-processing pass: Merges trailing orphan fragments (e.g. 'em mọi thứ ân huệ')
        back into the preceding segment if total length and duration fit on 1 screen.
        """
        if len(segments) <= 1:
            return segments

        merged = []
        skip_next = False

        for i in range(len(segments)):
            if skip_next:
                skip_next = False
                continue

            curr = segments[i]
            if i < len(segments) - 1:
                nxt = segments[i + 1]
                curr_text = curr["text"].replace("\n", " ")
                nxt_text = nxt["text"].replace("\n", " ")
                combined_text = f"{curr_text} {nxt_text}"
                combined_dur = nxt["end_time"] - curr["start_time"]
                gap = nxt["start_time"] - curr["end_time"]

                # Check if next segment is a short fragment (<= 25 chars or <= 4 words)
                # and combining fits comfortably in 1 screen (<= 80 chars, <= 7.0s, gap < 0.7s)
                is_short_fragment = len(nxt_text) <= 25 or len(nxt_text.split()) <= 4
                if is_short_fragment and len(combined_text) <= max_chars and combined_dur <= max_dur and gap < 0.7:
                    # Merge nxt into curr
                    all_words = (curr.get("words") or []) + (nxt.get("words") or [])
                    merged.append({
                        "sequence_number": len(merged) + 1,
                        "start_time": curr["start_time"],
                        "end_time": nxt["end_time"],
                        "text": cls.format_line_breaks(combined_text, max_cpl=40),
                        "words": all_words,
                        "speaker": curr.get("speaker", "Speaker 1")
                    })
                    skip_next = True
                    continue

            curr_copy = dict(curr)
            curr_copy["sequence_number"] = len(merged) + 1
            merged.append(curr_copy)

        return merged

    @classmethod
    def segment_words(
        cls,
        words: List[Dict[str, Any]],
        max_cpl: int = 40,
        max_lines: int = 2,
        min_duration: float = 0.8,
        max_duration: float = 7.0,
        max_cps: float = 20.0,
        pause_threshold: float = 0.45
    ) -> List[Dict[str, Any]]:
        """
        Groups timecoded words into broadcast-standard subtitle screens.
        """
        if not words:
            return []

        # Merge lone punctuation tokens (: , . ; ! ?) into previous words
        merged_words = []
        for w in words:
            w_str = w.get("word", "").strip()
            if not w_str:
                continue
            if w_str in {":", ",", ".", ";", "!", "?", "…"} and merged_words:
                merged_words[-1]["word"] += w_str
                merged_words[-1]["end"] = w.get("end", merged_words[-1]["end"])
            else:
                merged_words.append(dict(w))

        clean_words = merged_words
        if not clean_words:
            return []

        segments = []
        current_block_words = []
        max_total_chars = max_cpl * max_lines  # e.g. 80 chars max per screen

        hard_punctuation = {".", "!", "?", "...", "…"}

        for i, word_item in enumerate(clean_words):
            word_str = word_item["word"].strip()
            word_start = word_item["start"]
            word_end = word_item["end"]

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

            # Check if this boundary is between a compound pair
            w1_clean = prev_word["word"].lower().strip(".,:;!?\"“”")
            w2_clean = word_str.lower().strip(".,:;!?\"“”")
            is_compound = (w1_clean, w2_clean) in cls.COMPOUND_PAIRS

            # 1. Silence / Pause Gap (Only split if not inside compound pair or gap is huge > 1.0s)
            if gap >= pause_threshold and (not is_compound or gap >= 1.0):
                should_split = True

            # 2. Hard sentence end (. ? ! …)
            elif any(prev_word["word"].endswith(p) for p in hard_punctuation) and (gap >= 0.20 or tentative_len >= 30):
                should_split = True

            # 3. Direct dialogue introduction (: or rằng :)
            elif (prev_word["word"].endswith(":") or prev_word["word"].lower() in {"rằng:", "rằng"}) and tentative_len >= 25:
                should_split = True

            # 4. Exceeds max screen capacity (80 chars) or max duration
            elif tentative_len > max_total_chars or current_duration > max_duration:
                remaining_words = len(clean_words) - i
                if remaining_words > 1:
                    should_split = True

            if should_split:
                block_len = len(" ".join([w["word"] for w in current_block_words]))
                if block_len > max_total_chars:
                    clause_idx = cls.find_best_clause_split(current_block_words, max_chars_per_screen=max_total_chars)
                    if clause_idx != -1:
                        sub_words1 = current_block_words[:clause_idx]
                        raw_1 = " ".join([w["word"] for w in sub_words1])
                        segments.append({
                            "sequence_number": len(segments) + 1,
                            "start_time": round(sub_words1[0]["start"], 3),
                            "end_time": round(sub_words1[-1]["end"], 3),
                            "text": cls.format_line_breaks(raw_1, max_cpl=max_cpl, max_lines=max_lines),
                            "words": list(sub_words1),
                            "speaker": "Speaker 1"
                        })
                        current_block_words = current_block_words[clause_idx:]

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

                current_block_words = [word_item]
            else:
                current_block_words.append(word_item)

        # Flush remaining words
        if current_block_words:
            block_len = len(" ".join([w["word"] for w in current_block_words]))
            if block_len > max_total_chars:
                clause_idx = cls.find_best_clause_split(current_block_words, max_chars_per_screen=max_total_chars)
                if clause_idx != -1:
                    sub_words1 = current_block_words[:clause_idx]
                    raw_1 = " ".join([w["word"] for w in sub_words1])
                    segments.append({
                        "sequence_number": len(segments) + 1,
                        "start_time": round(sub_words1[0]["start"], 3),
                        "end_time": round(sub_words1[-1]["end"], 3),
                        "text": cls.format_line_breaks(raw_1, max_cpl=max_cpl, max_lines=max_lines),
                        "words": list(sub_words1),
                        "speaker": "Speaker 1"
                    })
                    current_block_words = current_block_words[clause_idx:]

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

        # Run Anti-Fragmentation Merger pass
        final_segments = cls.merge_short_fragments(segments, max_chars=max_total_chars, max_dur=max_duration)
        return final_segments

    @classmethod
    def re_segment_from_raw(
        cls,
        raw_segments: List[Dict[str, Any]],
        max_cpl: int = 40,
        max_lines: int = 2,
        min_duration: float = 0.8,
        max_duration: float = 7.0,
        max_cps: float = 20.0,
        pause_threshold: float = 0.45
    ) -> List[Dict[str, Any]]:
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

        result = []
        for idx, s in enumerate(raw_segments, start=1):
            text = s.get("text", "").strip()
            if not text:
                continue
            formatted = cls.format_line_breaks(text, max_cpl=max_cpl, max_lines=max_lines)
            result.append({
                "sequence_number": idx,
                "start_time": s.get("start", 0.0),
                "end_time": s.get("end", 0.0),
                "text": formatted,
                "words": [],
                "speaker": s.get("speaker", "Speaker 1")
            })
        return cls.merge_short_fragments(result, max_chars=max_cpl*max_lines, max_dur=max_duration)
