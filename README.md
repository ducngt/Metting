# Meeting Intelligence — Trợ Lý Họp Cho Hiệu Trưởng Đại Học

> Hệ thống thu âm, nhận dạng giọng nói tiếng Việt (ASR Whisper), phân tích tham mưu lãnh đạo bằng LLM và tự động xuất bản biên bản XeLaTeX chuẩn mực phục vụ công tác điều hành của Hiệu trưởng.

---

## 1. Giới thiệu & Kiến trúc hệ thống

Hệ thống được thiết kế theo mô hình pipeline 5 tầng chuyên biệt, bảo đảm tính xác thực, minh bạch và khả năng truy vết nguồn gốc (provenance):

```
[ Microphone / Audio File ]
            │
            ▼
    [ Module 1: recorder.py ]
    • Chuẩn hóa: 16 kHz, Mono, PCM 16-bit WAV
            │
            ▼
    [ Module 2: transcriber.py ]
    • Whisper ASR (large-v3 / medium)
    • Phân đoạn thời gian (HH:MM:SS) & Người nói
            │
            ▼
    [ Module 3: analyzer.py ]
    • LLM (Gemini 2.5 Pro / GPT-4o / Claude 3.5 Sonnet)
    • Tuân thủ 5 Nguyên tắc Tham mưu khắt khe
    • Trích xuất JSON 9 phần cấu trúc chuẩn
            │
            ▼
    [ Module 4: latex_renderer.py ]
    • Escape ký tự đặc biệt LaTeX (&, %, $, #, _, {, }, ~, ^, \)
    • Render Jinja2 Template (report.tex.j2)
            │
            ▼
    [ Module 5: compiler.py ]
    • XeLaTeX 2 lượt (-interaction=nonstopmode)
    • Font Times New Roman (fallback Latin Modern Roman)
            │
            ▼
   [ BẢN PDF & FILE TEX HOÀN THIỆN ]
```

### 5 Nguyên tắc Tham mưu bắt buộc (Core Principles)
1. **Tuyệt đối không suy diễn**: Không tự ý bịa đặt số liệu hay tự tiện gắn quyết định khi cuộc họp chưa chốt.
2. **Dẫn nguồn nghiêm ngặt**: Mọi khẳng định phải kèm mốc thời gian: `[Mã nguồn, HH:MM:SS]` (ví dụ: `[BG-01, 00:32:15]`).
3. **Minh bạch thông tin khuyết thiếu**: Nội dung không rõ phải ghi rõ `"Chưa xác định"` hoặc `"Cần kiểm chứng"`.
4. **Phân định 3 trạng thái quyết định**: Tách bạch `"Đã kết luận"` — `"Đang đề xuất"` — `"Chưa xác định"`.
5. **Gợi ý tham mưu độc lập**: Phần góp ý tham mưu được đánh dấu rõ là do hệ thống đề xuất nhằm nhận diện góc khuất/rủi ro, không phải phát biểu của Hiệu trưởng.

---

## 2. Yêu cầu cài đặt môi trường

### 2.1. Cài đặt Python & Thư viện phụ thuộc
Hệ thống tương thích Python 3.9 — 3.12.

```bash
# Tạo môi trường ảo
python3 -m venv venv
source venv/bin/activate  # Trên Linux/macOS
# venv\Scripts\activate   # Trên Windows

# Cài đặt toàn bộ thư viện
pip install -r requirements.txt
```

### 2.2. Cài đặt XeLaTeX & Font chữ tiếng Việt

Hệ thống bắt buộc dùng trình biên dịch **XeLaTeX** (qua lệnh `xelatex`) để hỗ trợ đầy đủ Unicode tiếng Việt và font Times New Roman:

- **Ubuntu / Debian:**
  ```bash
  sudo apt-get update
  sudo apt-get install -y texlive-xetex texlive-fonts-recommended texlive-fonts-extra texlive-lang-other
  # Cài đặt font Times New Roman (tùy chọn nhưng khuyến nghị):
  sudo apt-get install -y ttf-mscorefonts-installer
  ```
- **macOS:**
  ```bash
  brew install --cask mactex-no-gui
  # Hoặc dùng bản thu gọn: brew install --cask basictex
  ```
- **Windows:**
  - Tải và cài đặt [MiKTeX](https://miktex.org/download) hoặc [TeX Live](https://www.tug.org/texlive/).

### 2.3. Cài đặt FFmpeg (Tùy chọn cho chuyển đổi audio)
- Ubuntu/Debian: `sudo apt-get install -y ffmpeg`
- macOS: `brew install ffmpeg`

---

## 3. Cấu hình khóa API (.env)

Sao chép file `.env.example` thành `.env` và điền khóa API bạn muốn sử dụng:

```bash
cp .env.example .env
```

Nội dung `.env`:
```env
# Dùng Google Gemini (Khuyến nghị)
GEMINI_API_KEY="AIzaSy..."

# Dùng OpenAI (cho Whisper API hoặc GPT-4o)
OPENAI_API_KEY="sk-..."

# Dùng Anthropic (cho Claude 3.5 Sonnet)
ANTHROPIC_API_KEY="sk-ant-..."

# Chọn LLM mặc định
LLM_PROVIDER="gemini"
LLM_MODEL="gemini-2.5-pro"
```

---

## 4. Hướng dẫn sử dụng CLI

Hệ thống đóng gói dưới dạng Python module thực thi trực tiếp qua `python -m meeting_assistant`:

### 4.1. Chạy quy trình tự động toàn trình (Pipeline)
Xử lý từ file ghi âm cuộc họp và metadata đầu vào để sinh ra bản PDF và file TeX hoàn chỉnh:

```bash
python -m meeting_assistant run \
  --input tests/sample_audio.wav \
  --meta tests/sample_meta.json \
  --out output/ \
  --asr-mode offline \
  --asr-model large-v3 \
  --llm-provider gemini
```

Các file kết quả được lưu tại thư mục `output/`:
- `output/report.pdf`: Bản PDF tham mưu hoàn chỉnh 9 phần.
- `output/report.tex`: Mã nguồn XeLaTeX đã qua làm sạch ký tự.
- `output/analysis.json`: Dữ liệu phân tích có cấu trúc từ LLM.
- `output/transcript.json`: Danh sách gỡ băng ASR kèm mốc thời gian.
- `output/sample_audio_16k.wav`: File âm thanh chuẩn hóa 16kHz mono.

*Ghi chú*: Nếu chưa cài đặt TeX Live, bạn có thể thêm cờ `--skip-compile` để xuất file `.tex` và biên dịch sau:
```bash
python -m meeting_assistant run --input tests/sample_audio.wav --meta tests/sample_meta.json --skip-compile
```

### 4.2. Ghi âm trực tiếp từ Microphone
Thu âm trực tiếp cuộc họp tại phòng làm việc của Hiệu trưởng:

```bash
# Thu âm trong 3600 giây (1 giờ)
python -m meeting_assistant record --duration 3600 --out recording.wav

# Thu âm liên tục (dừng bằng tổ hợp phím Ctrl + C)
python -m meeting_assistant record --out cuoc_hop_bgh.wav
```

### 4.3. Biên dịch độc lập file XeLaTeX
Khi bạn muốn chỉnh sửa thủ công nội dung trong file `.tex` rồi biên dịch lại ra PDF:

```bash
python -m meeting_assistant compile --tex output/report.tex --clean
```

### 4.4. Chạy riêng lẻ từng công đoạn
- **Chỉ gỡ băng ASR**:
  ```bash
  python -m meeting_assistant transcribe --input recording.wav --out transcript.json --mode offline
  ```
- **Chỉ phân tích tham mưu**:
  ```bash
  python -m meeting_assistant analyze --transcript transcript.json --meta tests/sample_meta.json --out analysis.json
  ```

---

## 5. Cấu trúc 9 phần của Bản tham mưu (XeLaTeX)

1. **Thông tin cuộc họp**: Thời gian, địa điểm, chủ trì, thành phần, mục tiêu, mã nguồn, người rà soát & ngày rà soát.
2. **Hiệu trưởng cần nắm ngay**: Các thông tin cốt lõi, vấn đề khẩn cấp kèm mốc trích dẫn `\source{...}`.
3. **Quyết định, đề xuất và vấn đề còn mở**: Bảng trạng thái ba phân nhóm: *Đã kết luận* | *Đang đề xuất* | *Chưa xác định*.
4. **Bảng giao việc và thời hạn**: Mã công việc, sản phẩm đầu ra, đơn vị chịu trách nhiệm, thời hạn và căn cứ giao việc.
5. **Rủi ro, nguồn lực và tác động**: Nhận diện rủi ro tiềm ẩn, tác động và phương án giảm thiểu.
6. **Theo dõi sau họp**: Danh sách các đầu mối và hành động cần giám sát tiếp theo.
7. **Định hướng, bất đồng và tín hiệu xu hướng**: Định hướng đã tuyên bố, các quan điểm trái chiều và nội dung cần xác minh.
8. **Góp ý tham mưu dành cho Hiệu trưởng**: Khối tham mưu độc lập của hệ thống hỗ trợ lãnh đạo.
9. **Kiểm chứng trước khi sử dụng**: Bảng đối soát chứng cứ pháp lý và bảng chữ ký xác nhận của Người rà soát & Hiệu trưởng.

---

## 6. Chạy kiểm thử tự động (Tests)

Để xác nhận tính ổn định của hệ thống trước khi vận hành:

```bash
pytest tests/test_pipeline.py -v
```

Bộ test bao gồm:
- Kiểm tra hàm `escape_latex` xử lý triệt để ký tự đặc biệt (`&, %, $, #, _, {, }, ~, ^, \`).
- Kiểm tra chuẩn hóa thời gian và chuyển đổi audio 16kHz mono.
- Kiểm tra tính toàn vẹn của Jinja2 XeLaTeX template và thứ tự 9 section.
- Kiểm tra khả năng xử lý fallback an toàn khi mất kết nối mạng.
