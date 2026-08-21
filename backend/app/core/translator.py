import urllib.parse
import urllib.request
import json
import re
from typing import List, Dict, Any, Optional

class SubtitleTranslator:
    """
    Translates subtitle segments while preserving line structure and timestamps.
    Supports free Google Translate API endpoint and Cloud LLM endpoints.
    """

    @classmethod
    def translate_text_free(cls, text: str, target_lang: str = "vi", source_lang: str = "auto") -> str:
        """
        Translates text via Google Translate public API.
        """
        if not text.strip():
            return ""

        try:
            url = (
                f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}"
                f"&tl={target_lang}&dt=t&q={urllib.parse.quote(text)}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))
                translated = "".join([part[0] for part in result[0] if part[0]])
                return translated
        except Exception as e:
            print(f"Translation error: {e}")
            return text

    @classmethod
    def translate_segments(
        cls,
        segments: List[Dict[str, Any]],
        target_lang: str = "vi",
        source_lang: str = "auto"
    ) -> List[Dict[str, Any]]:
        """
        Translates all subtitle segments in batch.
        """
        translated_segments = []
        for seg in segments:
            orig_text = seg.get("text", "")
            # Preserve line breaks during translation
            lines = orig_text.split("\n")
            translated_lines = [
                cls.translate_text_free(line, target_lang=target_lang, source_lang=source_lang)
                for line in lines
            ]
            translated_text = "\n".join(translated_lines)

            new_seg = dict(seg)
            new_seg["text"] = translated_text
            # Clear individual word timestamps for translated track as word order changed
            new_seg["words"] = []
            translated_segments.append(new_seg)

        return translated_segments
