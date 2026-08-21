# AI Subtitle Studio - Hệ thống Tạo và Quản lý Phụ đề Thông minh

Hệ thống chuyên nghiệp tạo phụ đề tự động từ file âm thanh/video với độ chính xác cao (Word-level timestamps), phân tách người nói (Speaker Diarization), chuẩn hóa phụ đề theo chuẩn phát sóng (Netflix/BBC), trình chỉnh sửa trực quan (Waveform Timeline Editor) và xuất đa định dạng (`.srt`, `.vtt`, `.ass`, `.json`, `.txt`, `.fcpxml`).

---

## 🌟 Các Tính năng Nổi bật

1. **Độ chính xác chuẩn từng từ (Millisecond Precision)**:
   - Tích hợp **Faster-Whisper** với hỗ trợ **VAD (Voice Activity Detection)** loại bỏ hoàn toàn khoảng lặng và tiếng ồn.
   - Trích xuất mốc thời gian bắt đầu/kết thúc chuẩn xác cho từng từ và tính điểm tin cậy (confidence score).
2. **Khử lặp từ & Tinh chỉnh Ngữ cảnh (NLP Post-Processing)**:
   - Tự động phát hiện và cắt bỏ các vòng lặp hallucination của AI.
   - Tự động chuẩn hóa viết hoa đầu câu, khoảng cách dấu câu và tùy chọn lọc bỏ từ đệm (*ừm, à, nè, you know*).
3. **Phân tách người nói (Speaker Diarization)**:
   - Tự động gán nhãn và phân màu cho từng nhân vật (Speaker 1, Speaker 2,...), dễ dàng chỉnh sửa tên nhân vật trên giao diện.
4. **Chuẩn hóa phát sóng (Netflix/BBC Subtitling Rules)**:
   - **CPL (Characters Per Line)**: Giới hạn tối đa ký tự/dòng (mặc định 40).
   - **CPS (Characters Per Second)**: Giám sát tốc độ đọc & cảnh báo nếu vượt quá 20 CPS.
   - Phân đoạn thông minh dựa theo dấu câu và khoảng lặng tự nhiên.
5. **Dịch phụ đề Đa ngôn ngữ (Bilingual & Translation)**:
   - Dịch phụ đề tự động sang Tiếng Anh, Tiếng Nhật, Tiếng Hàn, Tiếng Trung, Tiếng Pháp... và bảo toàn 100% mốc thời gian của từng câu.
6. **Web Studio Trực quan & Đồng bộ Realtime**:
   - Biểu đồ sóng âm thanh (Waveform) kéo thả trực quan.
   - Xem video/nghe audio kèm khung hiển thị phụ đề trực tiếp.
   - Chỉnh sửa mốc thời gian, nội dung, thêm/xóa/gộp/tách đoạn phụ đề dễ dàng.
7. **Đa định dạng Xuất (Export Formats)**:
   - **.SRT**: Chuẩn SubRip thông dụng.
   - **.VTT**: WebVTT cho trình duyệt HTML5 video.
   - **.ASS**: Hỗ trợ Typography, màu sắc và hiệu ứng Karaoke (Word-highlighting).
   - **.JSON**: Dữ liệu có cấu trúc đầy đủ mốc thời gian từng từ.
   - **.TXT**: Bản transcript văn bản thuần kèm mốc thời gian và tên người nói.
   - **.FCPXML**: Định dạng XML cho Final Cut Pro / Adobe Premiere Pro.

---

## 🚀 Hướng dẫn Cài đặt & Sử dụng

### 1. Khởi chạy Ứng dụng

Chỉ cần chạy lệnh sau từ thư mục dự án:

```bash
./run.sh
```

Hoặc kích hoạt môi trường ảo thủ công:

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Sau đó mở trình duyệt web truy cập: **[http://localhost:8000](http://localhost:8000)**

---

## 📁 Cấu trúc Thư mục Dự án

```
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI server & static file mount
│   │   ├── config.py                # Cấu hình hệ thống, model Whisper, chuẩn CPL/CPS
│   │   ├── database.py              # Kết nối SQLAlchemy SQLite
│   │   ├── models/                  # Database ORM models (Project, Subtitle, Segment, Speaker)
│   │   ├── schemas/                 # Pydantic validation schemas
│   │   ├── core/                    # AI & Audio Engine
│   │   │   ├── audio.py             # Trích xuất âm thanh 16kHz, FFprobe & Waveform peaks
│   │   │   ├── transcriber.py       # Faster-Whisper với Word Timestamps & VAD
│   │   │   ├── segmenter.py         # Căn chỉnh phân đoạn chuẩn phát sóng (CPL, CPS)
│   │   │   ├── diarization.py       # Phân tách & gán nhãn người nói
│   │   │   ├── postprocessor.py     # Lọc hallucination & chuẩn hóa ngữ pháp
│   │   │   ├── translator.py        # Dịch phụ đề giữ mốc thời gian
│   │   │   └── exporters/           # Bộ xuất file SRT, VTT, ASS, JSON, TXT, FCPXML
│   │   ├── services/                # Background queue & pipeline manager
│   │   └── api/                     # RESTful API routers
│   ├── uploads/                     # Thư mục lưu file âm thanh/video
│   └── exports/                     # Thư mục lưu file phụ đề xuất
├── frontend/                        # Web Studio Interface
│   ├── index.html                   # Giao diện chính Studio (Tailwind, Video & Waveform)
│   ├── css/styles.css               # Tùy chỉnh theme, hiệu ứng timeline
│   └── js/app.js                    # Logic đồng bộ media, waveform & subtitle editor
├── tests/                           # Unit tests kiểm thử tự động
├── requirements.txt                 # Danh sách thư viện Python
├── run.sh                           # File khởi chạy nhanh
└── README.md
```

---

## 🧪 Kiểm thử Tự động (Testing)

Để chạy toàn bộ test suite kiểm tra pipeline:

```bash
.venv/bin/python3 -m unittest tests/test_pipeline.py
```
