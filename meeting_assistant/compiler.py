"""
Module 5 — compiler.py: Biên dịch file XeLaTeX thành file PDF hoàn chỉnh.
Chức năng:
- Gọi trình biên dịch `xelatex -interaction=nonstopmode <file>.tex` 2 lần liên tiếp
  (để giải quyết tham chiếu chéo số trang \thepage và định dạng cột tabularx)
- Bắt lỗi chi tiết, trích xuất dòng lỗi từ file .log nếu biên dịch thất bại
- Hướng dẫn cài đặt gói hoặc font chữ nếu phát hiện thiếu sót
- Tùy chọn dọn dẹp các tệp tạm thời (.aux, .log, .out, .toc)
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Union

from .utils import logger

class LatexCompiler:
    """Bộ biên dịch mã nguồn XeLaTeX thành định dạng PDF chất lượng cao."""

    def __init__(self, compiler_binary: str = "xelatex", runs: int = 2, timeout: int = 90):
        self.compiler_binary = compiler_binary
        self.runs = runs
        self.timeout = timeout

    def check_environment(self) -> bool:
        """Kiểm tra sự hiện diện của trình biên dịch xelatex trên hệ điều hành."""
        found = shutil.which(self.compiler_binary) is not None
        if not found:
            logger.warning(
                f"Không tìm thấy lệnh '{self.compiler_binary}' trong biến môi trường PATH.\n"
                "Hướng dẫn khắc phục:\n"
                "  - Ubuntu/Debian: sudo apt-get install texlive-xetex texlive-fonts-recommended texlive-lang-other\n"
                "  - macOS: brew install --cask mactex-no-gui (hoặc basictex)\n"
                "  - Windows: Cài đặt MiKTeX hoặc TeX Live."
            )
        return found

    def compile(
        self,
        tex_path: Union[str, Path],
        output_dir: Optional[Union[str, Path]] = None,
        clean_aux: bool = False,
    ) -> Path:
        """
        Biên dịch file .tex thành .pdf.
        Chạy 2 lượt để cập nhật số trang \thepage và header/footer.
        """
        tex_file = Path(tex_path).resolve()
        if not tex_file.exists():
            raise FileNotFoundError(f"Không tìm thấy file TeX tại: {tex_file}")

        if not self.check_environment():
            raise RuntimeError(
                f"Lệnh '{self.compiler_binary}' không khả dụng. Vui lòng cài đặt XeLaTeX theo hướng dẫn."
            )

        working_dir = tex_file.parent
        pdf_file = working_dir / f"{tex_file.stem}.pdf"
        log_file = working_dir / f"{tex_file.stem}.log"

        cmd = [
            self.compiler_binary,
            "-interaction=nonstopmode",
            "-halt-on-error",
            tex_file.name,
        ]

        logger.info(f"Bắt đầu biên dịch XeLaTeX (Số lượt: {self.runs}) cho tệp {tex_file.name}...")

        for run_idx in range(1, self.runs + 1):
            logger.info(f"Lượt biên dịch {run_idx}/{self.runs}...")
            try:
                result = subprocess.run(
                    cmd,
                    cwd=str(working_dir),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=self.timeout,
                    encoding="utf-8",
                    errors="replace",
                )

                if result.returncode != 0:
                    error_summary = self._extract_error_from_log(log_file)
                    raise RuntimeError(
                        f"Lỗi biên dịch XeLaTeX ở lượt {run_idx} (Mã lỗi {result.returncode}):\n"
                        f"{error_summary}\n"
                        f"Xem chi tiết trong file log: {log_file}"
                    )

            except subprocess.TimeoutExpired:
                raise TimeoutError(
                    f"Biên dịch XeLaTeX vượt quá thời gian cho phép ({self.timeout} giây)."
                )

        if not pdf_file.exists():
            raise RuntimeError(f"Biên dịch kết thúc nhưng không tìm thấy file PDF đầu ra: {pdf_file}")

        logger.info(f"Biên dịch PDF thành công! Tệp hoàn chỉnh: {pdf_file}")

        # Di chuyển ra thư mục đích nếu có yêu cầu
        if output_dir:
            target_dir = Path(output_dir).resolve()
            target_dir.mkdir(parents=True, exist_ok=True)
            target_pdf = target_dir / pdf_file.name
            shutil.copy2(pdf_file, target_pdf)
            pdf_file = target_pdf

        if clean_aux:
            self._cleanup_aux_files(working_dir, tex_file.stem)

        return pdf_file

    def _extract_error_from_log(self, log_file: Path) -> str:
        """Đọc và trích xuất dòng lỗi cụ thể từ file log của TeX."""
        if not log_file.exists():
            return "Không tìm thấy file .log để phân tích lỗi."

        error_lines = []
        try:
            with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
                for i, line in enumerate(lines):
                    if line.startswith("!"):
                        context = "".join(lines[max(0, i):min(len(lines), i + 8)])
                        error_lines.append(context)
        except Exception as e:
            return f"Không thể đọc file log: {e}"

        if error_lines:
            return "\n---\n".join(error_lines[:3])
        return "Vui lòng kiểm tra cuối file log để biết nguyên nhân chi tiết."

    def _cleanup_aux_files(self, directory: Path, stem: str) -> None:
        """Xóa các file tạm sinh ra trong quá trình biên dịch TeX."""
        aux_extensions = [".aux", ".log", ".out", ".toc", ".fls", ".fdb_latexmk"]
        for ext in aux_extensions:
            f = directory / f"{stem}{ext}"
            if f.exists():
                try:
                    f.unlink()
                except OSError:
                    pass
        logger.info("Đã dọn dẹp các tệp phụ trợ (.aux, .log, .out).")
