#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "========================================================"
echo "    🚀 ĐANG KHỞI CHẠY AI SUBTITLE STUDIO v1.0 PRO     "
echo "========================================================"

if [ ! -d ".venv" ]; then
    echo "📦 Đang khởi tạo môi trường Python virtualenv..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

echo "🌐 Server đang mở tại: http://localhost:8000"
echo "👉 Mở trình duyệt web và truy cập đường dẫn trên để sử dụng."
echo "--------------------------------------------------------"

.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
