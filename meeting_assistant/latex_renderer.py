"""
Module 4 — latex_renderer.py: Chuyển đổi dữ liệu JSON thành mã nguồn XeLaTeX (.tex).
Chức năng:
- Nạp Jinja2 template (report.tex.j2)
- Tự động làm sạch và escape triệt để các ký tự đặc biệt LaTeX
- Bổ sung bộ lọc (filters) tùy biến trong Jinja2: escape_latex, format_source
- Xuất file .tex UTF-8 chuẩn xác, sẵn sàng biên dịch bằng XeLaTeX
"""

from pathlib import Path
from typing import Any, Dict, Optional, Union
import re

try:
    import jinja2
except ImportError:
    jinja2 = None

from .utils import escape_latex, logger, sanitize_for_latex

class LatexRenderer:
    """Bộ tạo mã nguồn tài liệu XeLaTeX từ dữ liệu phân tích cuộc họp."""

    def __init__(self, template_dir: Optional[Union[str, Path]] = None, template_name: str = "report.tex.j2"):
        if template_dir is None:
            self.template_dir = Path(__file__).parent / "templates"
        else:
            self.template_dir = Path(template_dir)

        self.template_name = template_name
        self.template_file = self.template_dir / self.template_name

        if not self.template_file.exists():
            raise FileNotFoundError(
                f"Không tìm thấy template Jinja2 tại: {self.template_file}"
            )

        if jinja2 is not None:
            # Cấu hình Jinja2 Environment với các bộ lọc LaTeX chuyên dụng
            self.env = jinja2.Environment(
                loader=jinja2.FileSystemLoader(str(self.template_dir)),
                autoescape=False,
                trim_blocks=True,
                lstrip_blocks=True,
            )
            # Đăng ký custom filters
            self.env.filters["latex_escape"] = escape_latex
            self.env.filters["default_if_none"] = lambda val, d="": d if val is None else val
        else:
            self.env = None
            logger.warning("Thư viện 'jinja2' chưa được cài đặt. Sẽ dùng bộ render thuần thay thế.")

    def render(self, data: Dict[str, Any], output_tex_path: Union[str, Path]) -> Path:
        """
        Nhận từ điển dữ liệu từ Analyzer, làm sạch ký tự và ghi ra file .tex.
        """
        out_file = Path(output_tex_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Đang chuẩn bị dữ liệu và escape ký tự đặc biệt cho LaTeX...")
        clean_data = sanitize_for_latex(data)

        # Đảm bảo các cấu trúc chính luôn tồn tại để template không bị lỗi
        meeting_meta = clean_data.get("meeting", {})
        if not meeting_meta.get("university"):
            meeting_meta["university"] = "ĐẠI HỌC BÁCH KHOA HÀ NỘI"
        if not meeting_meta.get("meeting_id"):
            meeting_meta["meeting_id"] = "HT-2026-10-01"

        logger.info(f"Đang render template '{self.template_name}'...")
        if self.env is not None:
            template = self.env.get_template(self.template_name)
            rendered_content = template.render(**clean_data)
        else:
            rendered_content = self._render_pure_python(clean_data)

        # Ghi file .tex với encoding UTF-8
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(rendered_content)

        logger.info(f"Đã tạo file XeLaTeX thành công tại: {out_file}")
        return out_file

    def _render_pure_python(self, d: Dict[str, Any]) -> str:
        """Bộ render dự phòng khi môi trường chưa kịp pip install jinja2."""
        raw = self.template_file.read_text(encoding="utf-8")
        m = d.get("meeting", {})
        ds = d.get("direction_signals", {})
        
        # Thay thế biến meeting
        raw = re.sub(r'\{\{\s*meeting\.university\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("university", "ĐẠI HỌC BÁCH KHOA HÀ NỘI")), raw)
        raw = re.sub(r'\{\{\s*meeting\.meeting_id\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("meeting_id", "HT-2026-10-01")), raw)
        raw = re.sub(r'\{\{\s*meeting\.time\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("time", "Chưa xác định")), raw)
        raw = re.sub(r'\{\{\s*meeting\.location\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("location", "Phòng họp Ban Giám hiệu")), raw)
        raw = re.sub(r'\{\{\s*meeting\.chair\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("chair", "Chưa xác định")), raw)
        raw = re.sub(r'\{\{\s*meeting\.attendees\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("attendees", "Ban Giám hiệu và Trưởng các đơn vị")), raw)
        raw = re.sub(r'\{\{\s*meeting\.objective\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("objective", "Chưa xác định")), raw)
        raw = re.sub(r'\{\{\s*meeting\.reviewer\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("reviewer", "[Họ tên người rà soát]")), raw)
        raw = re.sub(r'\{\{\s*meeting\.review_date\s*\|\s*default\([^)]*\)\s*\}\}', str(m.get("review_date", "DD/MM/YYYY")), raw)

        # Thay thế direction_signals
        raw = re.sub(r'\{\{\s*direction_signals\.stated\s*\|\s*default\([^)]*\)\s*\}\}', str(ds.get("stated", "Chưa xác định định hướng xuyên suốt.")), raw)
        raw = re.sub(r'\{\{\s*direction_signals\.disagreements\s*\|\s*default\([^)]*\)\s*\}\}', str(ds.get("disagreements", "Chưa ghi nhận bất đồng đáng kể tại cuộc họp.")), raw)
        raw = re.sub(r'\{\{\s*direction_signals\.to_verify\s*\|\s*default\([^)]*\)\s*\}\}', str(ds.get("to_verify", "Cần đối chiếu với quy chế đào tạo hiện hành và kế hoạch tài chính đã phê duyệt.")), raw)

        # Sources
        sources_str = ", ".join([f"\\texttt{{{s}}}" for s in m.get("sources", ["BG-01"])])
        raw = re.sub(r'\{% for src in meeting\.sources %\}.*?\{% endfor %\}', lambda _: sources_str, raw, flags=re.DOTALL)

        # Key points
        kp_lines = "\n".join([f"  \\item \\textbf{{{p.get('bold', '')}}}: {p.get('detail', '')} \\source{{{p.get('source', '')}}}" for p in d.get("key_points", [])])
        raw = re.sub(r'\{% for point in key_points %\}.*?\{% endfor %\}', lambda _: kp_lines, raw, flags=re.DOTALL)

        # Decisions
        dec_lines = "\n".join([f"  \\textbf{{{item.get('status', 'Chưa xác định')}}} & {item.get('content', '')} & {item.get('implication', '')} \\\\\n  \\midrule" for item in d.get("decisions", [])])
        raw = re.sub(r'\{% for d in decisions %\}.*?\{% endfor %\}', lambda _: dec_lines, raw, flags=re.DOTALL)

        # Tasks
        task_lines = "\n".join([f"  {t.get('code', 'NV')} & {t.get('deliverable', '')} & {t.get('owner', '')} & {t.get('deadline', '')} & \\small {t.get('basis', '')} \\\\\n  \\midrule" for t in d.get("tasks", [])])
        raw = re.sub(r'\{% for task in tasks %\}.*?\{% endfor %\}', lambda _: task_lines, raw, flags=re.DOTALL)

        # Risks
        risk_lines = "\n".join([f"  {r.get('issue', '')} & {r.get('impact', '')} & {r.get('mitigation', '')} \\\\\n  \\midrule" for r in d.get("risks", [])])
        raw = re.sub(r'\{% for risk in risks %\}.*?\{% endfor %\}', lambda _: risk_lines, raw, flags=re.DOTALL)

        # Follow up
        fu_lines = "\n".join([f"  \\item {act}" for act in d.get("follow_up", [])])
        raw = re.sub(r'\{% for act in follow_up %\}.*?\{% endfor %\}', lambda _: fu_lines, raw, flags=re.DOTALL)

        # Suggestions
        sug_lines = "\n".join([f"  \\item {s}" for s in d.get("suggestions", [])])
        raw = re.sub(r'\{% for sugg in suggestions %\}.*?\{% endfor %\}', lambda _: sug_lines, raw, flags=re.DOTALL)

        # Verification
        v_lines = "\n".join([f"  {v.get('item', '')} & {v.get('evidence', '')} & \\textbf{{{v.get('status', 'Cần kiểm chứng')}}} \\\\\n  \\midrule" for v in d.get("verification", [])])
        raw = re.sub(r'\{% for v in verification %\}.*?\{% endfor %\}', lambda _: v_lines, raw, flags=re.DOTALL)

        # Dọn dẹp các thẻ jinja còn sót
        raw = re.sub(r'\{%.*?%\}', '', raw)
        return raw
