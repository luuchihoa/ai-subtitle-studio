import unittest
from backend.app.core.segmenter import SmartSubtitleSegmenter
from backend.app.core.postprocessor import SubtitlePostProcessor
from backend.app.core.diarization import SpeakerDiarizationEngine
from backend.app.core.exporters import export_subtitles

class TestSubtitlePipeline(unittest.TestCase):
    def setUp(self):
        self.sample_words = [
            {"word": "Xin", "start": 0.5, "end": 0.8, "probability": 0.99},
            {"word": "chào", "start": 0.82, "end": 1.1, "probability": 0.98},
            {"word": "các", "start": 1.15, "end": 1.3, "probability": 0.97},
            {"word": "bạn.", "start": 1.35, "end": 1.8, "probability": 0.99},
            # Gap of 1.4s indicating pause & new sentence / speaker
            {"word": "Hôm", "start": 3.2, "end": 3.5, "probability": 0.99},
            {"word": "nay", "start": 3.55, "end": 3.8, "probability": 0.99},
            {"word": "chúng", "start": 3.85, "end": 4.1, "probability": 0.98},
            {"word": "ta", "start": 4.15, "end": 4.3, "probability": 0.99},
            {"word": "sẽ", "start": 4.35, "end": 4.5, "probability": 0.99},
            {"word": "tìm", "start": 4.55, "end": 4.8, "probability": 0.99},
            {"word": "hiểu", "start": 4.85, "end": 5.1, "probability": 0.99},
            {"word": "về", "start": 5.15, "end": 5.3, "probability": 0.99},
            {"word": "hệ", "start": 5.35, "end": 5.5, "probability": 0.99},
            {"word": "thống", "start": 5.55, "end": 5.8, "probability": 0.99},
            {"word": "tạo", "start": 5.85, "end": 6.0, "probability": 0.99},
            {"word": "phụ", "start": 6.05, "end": 6.2, "probability": 0.99},
            {"word": "đề", "start": 6.25, "end": 6.5, "probability": 0.99},
            {"word": "AI", "start": 6.55, "end": 6.8, "probability": 0.99},
            {"word": "chuẩn", "start": 6.85, "end": 7.1, "probability": 0.99},
            {"word": "xác.", "start": 7.15, "end": 7.5, "probability": 0.99},
        ]

    def test_smart_segmentation(self):
        segments = SmartSubtitleSegmenter.segment_words(
            self.sample_words,
            max_cpl=35,
            max_lines=2,
            min_duration=1.0,
            max_duration=6.0,
            pause_threshold=0.5
        )
        self.assertGreaterEqual(len(segments), 2)
        self.assertEqual(segments[0]["start_time"], 0.5)
        self.assertIn("Xin chào các bạn.", segments[0]["text"])

    def test_complex_dialogue_segmentation(self):
        complex_text = "Có lời Đức Chúa phán với tôi rằng : Hỡi con người, hãy tuyên sấm hạch tội các mục tử chăn dắt Ít-ra-en, hãy tuyên sấm."
        words = []
        t = 0.0
        for w in complex_text.split():
            words.append({"word": w, "start": round(t, 2), "end": round(t + 0.3, 2), "probability": 0.99})
            t += 0.35

        segments = SmartSubtitleSegmenter.segment_words(words, max_cpl=45, max_lines=2)
        self.assertEqual(len(segments), 2)
        # Verify Screen 1 is introductory clause
        self.assertIn("Có lời Đức Chúa phán với tôi rằng:", segments[0]["text"])
        # Verify Screen 2 has max 2 lines and does NOT break 'hãy' away from 'tuyên sấm'
        self.assertNotIn("hãy\n", segments[1]["text"])
        self.assertNotIn("\nsấm.", segments[1]["text"])
        self.assertLessEqual(len(segments[1]["text"].split("\n")), 2)


    def test_post_processor_hallucinations(self):
        hallucinated_text = "Xin chào các bạn đã đến kênh. Xin chào các bạn đã đến kênh. Xin chào các bạn đã đến kênh."
        cleaned = SubtitlePostProcessor.remove_hallucination_loops(hallucinated_text)
        self.assertEqual(cleaned, "Xin chào các bạn đã đến kênh.")

    def test_diarization_assignment(self):
        segments = SmartSubtitleSegmenter.segment_words(self.sample_words, pause_threshold=0.5)
        assigned, speakers = SpeakerDiarizationEngine.assign_default_speakers(segments, num_speakers=2)
        self.assertGreaterEqual(len(speakers), 2)
        self.assertTrue(all("speaker" in s for s in assigned))

    def test_exporters(self):
        segments = [
            {"sequence_number": 1, "start_time": 1.25, "end_time": 3.50, "text": "Xin chào thế giới", "speaker": "Speaker 1"},
            {"sequence_number": 2, "start_time": 4.10, "end_time": 7.20, "text": "Phụ đề chất lượng cao", "speaker": "Speaker 2"}
        ]
        srt_out = export_subtitles(segments, format_type="srt")
        self.assertIn("00:00:01,250 --> 00:00:03,500", srt_out)
        self.assertIn("Xin chào thế giới", srt_out)

        vtt_out = export_subtitles(segments, format_type="vtt")
        self.assertIn("WEBVTT", vtt_out)
        self.assertIn("00:00:01.250 --> 00:00:03.500", vtt_out)

        ass_out = export_subtitles(segments, format_type="ass")
        self.assertIn("[Script Info]", ass_out)
        self.assertIn("Dialogue:", ass_out)

        json_out = export_subtitles(segments, format_type="json")
        self.assertIn('"segment_count": 2', json_out)

if __name__ == "__main__":
    unittest.main()
