"""
Hệ thống Meeting Intelligence hỗ trợ Hiệu trưởng Đại học.
Bao gồm các module:
- recorder: Thu âm microphone & chuẩn hóa âm thanh
- transcriber: Nhận dạng giọng nói tiếng Việt Whisper (offline/online)
- analyzer: Phân tích tham mưu lãnh đạo bằng LLM
- latex_renderer: Tạo mã nguồn XeLaTeX tiếng Việt từ dữ liệu JSON
- compiler: Biên dịch tài liệu XeLaTeX thành file PDF hoàn chỉnh
"""

__version__ = "1.0.0"
__author__ = "Ban Tham Mưu & Công Nghệ Thông Tin"
