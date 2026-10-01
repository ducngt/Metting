"""
Module 6 — cli.py: Giao diện dòng lệnh (CLI) điều khiển toàn diện hệ thống.
Hỗ trợ các lệnh:
1. `python -m meeting_assistant run --input recording.wav --meta meta.json --out report/`
    - Thực thi toàn trình (Pipeline): Chuẩn hóa âm thanh -> Whisper ASR -> Phân tích LLM -> Render TeX -> Biên dịch PDF
2. `python -m meeting_assistant record --duration 3600 --out recording.wav`
    - Thu âm từ microphone
3. `python -m meeting_assistant compile --tex report.tex`
    - Biên dịch file XeLaTeX độc lập
4. `python -m meeting_assistant transcribe --input recording.wav --out transcript.json`
5. `python -m meeting_assistant analyze --transcript transcript.json --meta meta.json --out analysis.json`
"""

import argparse
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    load_dotenv = None

from .analyzer import MeetingAnalyzer
from .compiler import LatexCompiler
from .latex_renderer import LatexRenderer
from .recorder import AudioRecorder
from .transcriber import AudioTranscriber
from .utils import load_meta, save_json, setup_logging, logger

def cmd_record(args: argparse.Namespace) -> None:
    """Xử lý lệnh ghi âm từ microphone."""
    recorder = AudioRecorder(sample_rate=args.sample_rate)
    out_file = Path(args.out)
    recorder.record_microphone(
        output_wav_path=out_file,
        duration_seconds=args.duration,
        device_index=args.device,
    )
    print(f"\n[THÀNH CÔNG] Đã ghi âm và lưu tại: {out_file.resolve()}")

def cmd_transcribe(args: argparse.Namespace) -> None:
    """Xử lý lệnh nhận dạng giọng nói từ file ghi âm."""
    recorder = AudioRecorder()
    norm_audio = recorder.normalize_audio(args.input)

    transcriber = AudioTranscriber(
        mode=args.mode,
        model_size=args.model,
        language=args.lang,
    )
    segments = transcriber.transcribe(norm_audio)

    out_json = Path(args.out) if args.out else Path(args.input).with_suffix(".transcript.json")
    save_json(segments, out_json)
    print(f"\n[THÀNH CÔNG] Đã hoàn thành ASR ({len(segments)} phân đoạn). Kết quả: {out_json.resolve()}")

def cmd_compile(args: argparse.Namespace) -> None:
    """Xử lý lệnh biên dịch XeLaTeX."""
    compiler = LatexCompiler(
        compiler_binary=args.compiler,
        runs=args.runs,
        timeout=args.timeout,
    )
    pdf_path = compiler.compile(
        tex_path=args.tex,
        output_dir=args.out_dir,
        clean_aux=args.clean,
    )
    print(f"\n[THÀNH CÔNG] Đã biên dịch PDF hoàn tất tại: {pdf_path.resolve()}")

def cmd_run(args: argparse.Namespace) -> None:
    """Xử lý pipeline tự động toàn trình từ âm thanh tới bản PDF cuối cùng."""
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    input_audio = Path(args.input)
    meta_path = Path(args.meta)

    logger.info("=== BẮT ĐẦU QUY TRÌNH HỖ TRỢ HỌP CHO HIỆU TRƯỞNG ===")

    # 1. Tải Metadata cuộc họp
    logger.info(f"Bước 1/5: Tải metadata từ {meta_path}...")
    meta_data = load_meta(meta_path)

    # 2. Chuẩn hóa âm thanh
    logger.info(f"Bước 2/5: Chuẩn hóa âm thanh {input_audio.name}...")
    recorder = AudioRecorder()
    normalized_wav = out_dir / f"{input_audio.stem}_16k.wav"
    recorder.normalize_audio(input_audio, output_wav_path=normalized_wav)

    # 3. Chạy ASR Whisper
    logger.info("Bước 3/5: Chuyển giọng nói thành văn bản (Whisper ASR)...")
    transcriber = AudioTranscriber(
        mode=args.asr_mode,
        model_size=args.asr_model,
        language="vi",
        demo_fallback=getattr(args, "demo", False),
    )
    segments = transcriber.transcribe(normalized_wav)
    transcript_file = out_dir / "transcript.json"
    save_json(segments, transcript_file)

    # 4. Phân tích tham mưu bằng LLM
    logger.info("Bước 4/5: Phân tích tham mưu lãnh đạo bằng LLM...")
    analyzer = MeetingAnalyzer(
        provider=args.llm_provider,
        model=args.llm_model,
    )
    analysis_data = analyzer.analyze(segments, meta_data)
    analysis_file = out_dir / "analysis.json"
    save_json(analysis_data, analysis_file)

    # 5. Xuất bản XeLaTeX
    logger.info("Bước 5/5: Tạo mã nguồn và biên dịch XeLaTeX...")
    renderer = LatexRenderer()
    tex_file = out_dir / "report.tex"
    renderer.render(analysis_data, tex_file)

    if not args.skip_compile:
        compiler = LatexCompiler(compiler_binary=args.compiler, runs=2)
        try:
            pdf_file = compiler.compile(tex_path=tex_file, clean_aux=args.clean)
            print(f"\n==================================================================")
            print(f" HOÀN TẤT BẢN THAM MƯU HỌP CHO HIỆU TRƯỞNG!")
            print(f" File PDF:        {pdf_file.resolve()}")
            print(f" Mã nguồn LaTeX: {tex_file.resolve()}")
            print(f" Dữ liệu JSON:   {analysis_file.resolve()}")
            print(f" Transcript:     {transcript_file.resolve()}")
            print(f"==================================================================")
        except Exception as e_comp:
            logger.error(f"Lỗi khi biên dịch XeLaTeX: {e_comp}")
            print(f"\n[LƯU Ý] Mã nguồn XeLaTeX đã tạo tại: {tex_file.resolve()}")
            print(f"Bạn có thể biên dịch thủ công bằng lệnh: xelatex {tex_file.name}")
    else:
        print(f"\n[THÀNH CÔNG] Đã sinh file XeLaTeX tại: {tex_file.resolve()}")

def main():
    """Hàm khởi chạy giao diện dòng lệnh."""
    setup_logging()

    parser = argparse.ArgumentParser(
        prog="meeting_assistant",
        description="Meeting Intelligence - Hệ thống hỗ trợ họp và tham mưu cho Hiệu trưởng đại học",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Lệnh chức năng")

    # Lệnh: run (toàn trình)
    parser_run = subparsers.add_parser("run", help="Chạy toàn bộ pipeline từ ghi âm tới PDF")
    parser_run.add_argument("--input", "-i", required=True, help="Đường dẫn file ghi âm (.wav, .mp3, .m4a)")
    parser_run.add_argument("--meta", "-m", required=True, help="Đường dẫn file metadata JSON")
    parser_run.add_argument("--out", "-o", default="output/", help="Thư mục xuất báo cáo")
    parser_run.add_argument("--asr-mode", default="offline", choices=["offline", "online"], help="Chế độ ASR Whisper")
    parser_run.add_argument("--asr-model", default="large-v3", help="Kích thước model Whisper (large-v3, medium, small)")
    parser_run.add_argument("--llm-provider", default="gemini", choices=["gemini", "openai", "anthropic"], help="Nhà cung cấp LLM")
    parser_run.add_argument("--llm-model", default=None, help="Tên model LLM cụ thể")
    parser_run.add_argument("--compiler", default="xelatex", help="Lệnh biên dịch LaTeX")
    parser_run.add_argument("--skip-compile", action="store_true", help="Chỉ tạo file .tex, bỏ qua biên dịch PDF")
    parser_run.add_argument("--demo", action="store_true", help="Bật chế độ thử nghiệm nhanh với dữ liệu ASR mô phỏng")
    parser_run.add_argument("--clean", action="store_true", help="Dọn dẹp file phụ trợ (.aux, .log) sau khi biên dịch")
    parser_run.set_defaults(func=cmd_run)

    # Lệnh: record (thu âm)
    parser_rec = subparsers.add_parser("record", help="Thu âm trực tiếp từ microphone")
    parser_rec.add_argument("--duration", "-d", type=int, default=None, help="Thời lượng ghi âm tính bằng giây")
    parser_rec.add_argument("--out", "-o", default="recording.wav", help="Đường dẫn lưu file WAV")
    parser_rec.add_argument("--sample-rate", "-r", type=int, default=16000, help="Tần số lấy mẫu (mặc định 16000Hz)")
    parser_rec.add_argument("--device", type=int, default=None, help="Chỉ số microphone input thiết bị")
    parser_rec.set_defaults(func=cmd_record)

    # Lệnh: compile (biên dịch TeX)
    parser_comp = subparsers.add_parser("compile", help="Biên dịch tệp .tex thành PDF bằng XeLaTeX")
    parser_comp.add_argument("--tex", "-t", required=True, help="Đường dẫn tệp .tex cần biên dịch")
    parser_comp.add_argument("--out-dir", "-o", default=None, help="Thư mục lưu PDF")
    parser_comp.add_argument("--compiler", default="xelatex", help="Trình biên dịch (mặc định: xelatex)")
    parser_comp.add_argument("--runs", type=int, default=2, help="Số lượt chạy xelatex (mặc định: 2)")
    parser_comp.add_argument("--timeout", type=int, default=90, help="Thời gian chờ tối đa (giây)")
    parser_comp.add_argument("--clean", action="store_true", help="Dọn dẹp các tệp tạm sau khi hoàn tất")
    parser_comp.set_defaults(func=cmd_compile)

    # Lệnh: transcribe
    parser_trans = subparsers.add_parser("transcribe", help="Chuyển đổi âm thanh thành văn bản")
    parser_trans.add_argument("--input", "-i", required=True, help="Tệp âm thanh đầu vào")
    parser_trans.add_argument("--out", "-o", default=None, help="Tệp JSON xuất ra")
    parser_trans.add_argument("--mode", default="offline", choices=["offline", "online"])
    parser_trans.add_argument("--model", default="large-v3")
    parser_trans.add_argument("--lang", default="vi")
    parser_trans.set_defaults(func=cmd_transcribe)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
