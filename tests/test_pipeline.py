"""
Bộ kiểm thử toàn diện (Unit & Integration tests) cho hệ thống Meeting Intelligence.
Chạy bằng: pytest tests/test_pipeline.py -v
"""

import json
from pathlib import Path
import pytest

from meeting_assistant.utils import (
    escape_latex,
    format_time,
    load_meta,
    sanitize_for_latex,
)
from meeting_assistant.recorder import AudioRecorder
from meeting_assistant.latex_renderer import LatexRenderer
from meeting_assistant.analyzer import MeetingAnalyzer

@pytest.fixture
def sample_meta_data():
    meta_path = Path("tests/sample_meta.json")
    return load_meta(meta_path)

@pytest.fixture
def sample_analysis_dict(sample_meta_data):
    return {
        "meeting": {
            "university": sample_meta_data.get("university", "ĐẠI HỌC BÁCH KHOA HÀ NỘI"),
            "meeting_id": sample_meta_data.get("meeting_id", "HT-2026-10-01"),
            "time": sample_meta_data.get("time"),
            "location": sample_meta_data.get("location"),
            "chair": sample_meta_data.get("chair"),
            "attendees": sample_meta_data.get("attendees"),
            "objective": sample_meta_data.get("objective"),
            "sources": sample_meta_data.get("sources", ["BG-01"]),
            "reviewer": sample_meta_data.get("reviewer"),
            "review_date": sample_meta_data.get("review_date"),
        },
        "key_points": [
            {
                "bold": "Điều chỉnh mức trần học phí kỹ thuật 12%",
                "detail": "Áp dụng cho khóa tuyển sinh 2027 với lộ trình tự chủ chi thường xuyên.",
                "source": "BG-01, 00:23:45",
            },
            {
                "bold": "Gói học bổng 50 tỷ đồng thu hút tài năng",
                "detail": "Dành cho thí sinh đạt giải quốc tế và thủ khoa các khối ngành trọng điểm.",
                "source": "BG-01, 00:45:10",
            }
        ],
        "decisions": [
            {
                "status": "Đã kết luận",
                "content": "Phê duyệt chủ trương tăng chỉ tiêu ngành Vi mạch Bán dẫn thêm 200 chỉ tiêu.",
                "implication": "Cần khẩn trương bổ sung 03 phòng lab mô phỏng chuyên sâu.",
            },
            {
                "status": "Đang đề xuất",
                "content": "Mở mới chương trình Thạc sĩ Trí tuệ Nhân tạo Ứng dụng.",
                "implication": "Chờ Hội đồng Khoa học và Đào tạo thẩm định đề án.",
            },
            {
                "status": "Chưa xác định",
                "content": "Phương án hợp tác đào tạo song bằng với Đại học Tokyo.",
                "implication": "Cần làm việc thêm về vấn đề công nhận tín chỉ quốc tế.",
            }
        ],
        "tasks": [
            {
                "code": "NV01",
                "deliverable": "Hoàn thiện Đề án Tuyển sinh 2027",
                "owner": "Phòng Đào tạo",
                "deadline": "15/10/2026",
                "basis": "Chỉ đạo Hiệu trưởng [BG-01, 00:32:00]",
            },
            {
                "code": "NV02",
                "deliverable": "Dự toán ngân sách học bổng tài năng",
                "owner": "Phòng Kế hoạch - Tài chính",
                "deadline": "20/10/2026",
                "basis": "Biên bản Ban Giám hiệu [BG-01, 00:50:12]",
            }
        ],
        "risks": [
            {
                "issue": "Biến động chỉ tiêu xét tuyển theo điểm thi tốt nghiệp THPT",
                "impact": "Có thể giảm điểm chuẩn đầu vào nếu không truyền thông tốt",
                "mitigation": "Đẩy mạnh xét tuyển kết hợp hồ sơ tài năng và bài thi đánh giá tư duy",
            }
        ],
        "follow_up": [
            "Đôn đốc Phòng Đào tạo gửi dự thảo đề án trước thứ Sáu tới",
            "Họp trực tuyến với đại diện Đại học Tokyo vào ngày 08/10/2026"
        ],
        "direction_signals": {
            "stated": "Kiên định mục tiêu tự chủ gắn liền với nâng cao chuẩn đầu ra và trách nhiệm giải trình xã hội.",
            "disagreements": "Ý kiến băn khoăn về áp lực tài chính đối với sinh viên có hoàn cảnh khó khăn.",
            "to_verify": "Quy định của Bộ GD&ĐT về định mức giảng viên/sinh viên ngành Vi mạch bán dẫn."
        },
        "suggestions": [
            "Đề xuất Hiệu trưởng thành lập Quỹ hỗ trợ sinh viên nghèo vượt khó trích từ 8% nguồn thu học phí để cân bằng tác động xã hội."
        ],
        "verification": [
            {
                "item": "Khung học phí trần theo Nghị định 97/2023/NĐ-CP",
                "evidence": "Văn bản số 128/KHTC đối chiếu phụ lục I",
                "status": "Đã rõ"
            },
            {
                "item": "Danh sách trang thiết bị lab vi mạch dự kiến mua sắm",
                "evidence": "Tờ trình của Viện Điện tử - Viễn thông",
                "status": "Cần kiểm chứng"
            }
        ]
    }

def test_escape_latex():
    """Kiểm tra tính năng escape ký tự đặc biệt của LaTeX."""
    raw = r"Tỷ lệ tăng 100% & chi phí $500, #1 danh sách, {nhóm A}, công thức x^2 ~ y_0 \ ghi chú"
    escaped = escape_latex(raw)

    assert r"\%" in escaped
    assert r"\&" in escaped
    assert r"\$" in escaped
    assert r"\#" in escaped
    assert r"\_" in escaped
    assert r"\{" in escaped
    assert r"\}" in escaped
    assert r"\textasciicircum{}" in escaped
    assert r"\textasciitilde{}" in escaped

def test_format_time():
    """Kiểm tra chuyển đổi giây sang HH:MM:SS."""
    assert format_time(0) == "00:00:00"
    assert format_time(65) == "00:01:05"
    assert format_time(3665) == "01:01:05"
    assert format_time(5400) == "01:30:00"

def test_audio_normalization():
    """Kiểm tra module recorder chuẩn hóa file âm thanh."""
    audio_path = Path("tests/sample_audio.wav")
    assert audio_path.exists(), "Cần có file tests/sample_audio.wav để test"

    out_norm = Path("output/test_norm_16k.wav")
    recorder = AudioRecorder(sample_rate=16000, channels=1)
    res_path = recorder.normalize_audio(audio_path, output_wav_path=out_norm)

    assert res_path.exists()
    assert res_path.stat().st_size > 0

def test_latex_renderer(sample_analysis_dict):
    """Kiểm tra việc render file XeLaTeX từ dữ liệu JSON và template Jinja2."""
    renderer = LatexRenderer(template_dir="meeting_assistant/templates")
    out_tex = Path("output/test_report.tex")

    result_path = renderer.render(sample_analysis_dict, out_tex)
    assert result_path.exists()

    content = result_path.read_text(encoding="utf-8")

    # Kiểm tra preamble bắt buộc
    assert "% !TeX program = xelatex" in content
    assert r"\documentclass[11pt,a4paper]{article}" in content
    assert "Times New Roman" in content
    assert "navy" in content
    assert "tabularx" in content

    # Kiểm tra đủ 9 section theo đúng thứ tự
    sections = [
        r"\section{Thông tin cuộc họp}",
        r"\section{Hiệu trưởng cần nắm ngay}",
        r"\section{Quyết định, đề xuất và vấn đề còn mở}",
        r"\section{Bảng giao việc và thời hạn}",
        r"\section{Rủi ro, nguồn lực và tác động}",
        r"\section{Theo dõi sau họp}",
        r"\section{Định hướng, bất đồng và tín hiệu xu hướng}",
        r"\section{Góp ý tham mưu dành cho Hiệu trưởng}",
        r"\section{Kiểm chứng trước khi sử dụng}",
    ]

    last_pos = -1
    for sec in sections:
        pos = content.find(sec)
        assert pos != -1, f"Thiếu section: {sec}"
        assert pos > last_pos, f"Thứ tự section bị sai lệch: {sec}"
        last_pos = pos

    # Kiểm tra các khối thông báo & nguồn
    assert r"\notice{Mẫu minh họa}" in content
    assert r"\notice{Quy tắc diễn giải}" in content
    assert r"\notice{Phần này do hệ thống đề xuất}" in content
    assert r"\source{BG-01, 00:23:45}" in content

    # Kiểm tra bảng ký tên
    assert "NGƯỜI RÀ SOÁT NỘI DUNG" in content
    assert "HIỆU TRƯỞNG / NGƯỜI ĐƯỢC GIAO XÁC NHẬN" in content
    assert "PGS. TS. Huỳnh Quyết Thắng" in content

def test_analyzer_fallback(sample_meta_data):
    """Kiểm tra khả năng tạo dữ liệu fallback an toàn của analyzer khi không có mạng."""
    analyzer = MeetingAnalyzer(provider="gemini", api_key="INVALID_TEST_KEY")
    segments = [
        {"start": 0, "end": 10, "start_fmt": "00:00:00", "end_fmt": "00:00:10", "speaker": "Chủ trì", "text": "Khai mạc cuộc họp."}
    ]
    data = analyzer.analyze(segments, sample_meta_data)

    assert "meeting" in data
    assert "key_points" in data
    assert "decisions" in data
    assert "tasks" in data
    assert "risks" in data
    assert "direction_signals" in data
    assert "suggestions" in data
    assert "verification" in data
