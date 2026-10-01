"""
Module các tiện ích phụ trợ cho hệ thống Meeting Intelligence.
Bao gồm:
- Escape ký tự đặc biệt trong LaTeX (bảo toàn công thức, ký tự đặc biệt tiếng Việt)
- Định dạng thời gian (giây sang HH:MM:SS)
- Đọc/ghi cấu hình, file metadata JSON
- Cấu hình logging thống nhất
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Union

try:
    import yaml
except ImportError:
    yaml = None

# Khởi tạo logger
logger = logging.getLogger("meeting_assistant")

def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """Cấu hình logging chuẩn mực cho ứng dụng."""
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            fmt="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger

def format_time(seconds: Union[int, float]) -> str:
    """Chuyển đổi số giây thành định dạng HH:MM:SS."""
    if seconds is None or seconds < 0:
        return "00:00:00"
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"

# Bảng tra cứu ký tự đặc biệt cần escape trong XeLaTeX
LATEX_SPECIAL_CHARS = [
    ('\\', r'\textbackslash{}'),
    ('&', r'\&'),
    ('%', r'\%'),
    ('$', r'\$'),
    ('#', r'\#'),
    ('_', r'\_'),
    ('{', r'\{'),
    ('}', r'\}'),
    ('~', r'\textasciitilde{}'),
    ('^', r'\textasciicircum{}'),
    ('<', r'\textless{}'),
    ('>', r'\textgreater{}'),
]

def escape_latex(text: Any) -> str:
    """
    Hàm escape triệt để các ký tự đặc biệt trong LaTeX.
    Bảo vệ Unicode tiếng Việt, dấu ngoặc nhọn, %, $, &, v.v.
    """
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)

    # 1. Bảo vệ trước dấu gạch chéo ngược
    result = text.replace('\\', r'\textbackslash{}')

    # 2. Thay thế các ký tự đặc biệt khác
    special_map = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
        '<': r'\textless{}',
        '>': r'\textgreater{}',
    }
    for char, rep in special_map.items():
        result = result.replace(char, rep)

    # 3. Chuẩn hóa dấu nháy kép tiếng Việt ("..." thành ``...'')
    # Tránh làm gãy chuỗi nếu đã là cú pháp LaTeX
    result = re.sub(r'"([^"]*)"', r"``\1''", result)

    return result

def sanitize_for_latex(data: Any) -> Any:
    """Đệ quy làm sạch toàn bộ dict/list để sẵn sàng truyền vào Jinja2 LaTeX template."""
    if isinstance(data, dict):
        return {k: sanitize_for_latex(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_latex(item) for item in data]
    elif isinstance(data, str):
        return escape_latex(data)
    else:
        return data

def load_meta(meta_path: Union[str, Path]) -> Dict[str, Any]:
    """Tải file metadata JSON chứa thông tin cuộc họp."""
    path = Path(meta_path)
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy file metadata tại: {meta_path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

def load_config(config_path: Union[str, Path] = "config.yaml") -> Dict[str, Any]:
    """Tải cấu hình từ file config.yaml."""
    path = Path(config_path)
    if not path.exists():
        return {}
    if yaml is not None:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    else:
        logger.warning("Thư viện pyyaml chưa được cài đặt. Bỏ qua nạp config.yaml.")
        return {}

def save_json(data: Any, out_path: Union[str, Path]) -> None:
    """Ghi dữ liệu dạng JSON với định dạng tiếng Việt UTF-8 chuẩn xác."""
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_json(in_path: Union[str, Path]) -> Any:
    """Đọc dữ liệu từ file JSON."""
    with open(in_path, "r", encoding="utf-8") as f:
        return json.load(f)
