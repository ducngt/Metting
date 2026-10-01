"""
Module 2 — transcriber.py: Nhận dạng giọng nói (ASR) đa phương thức.
Chức năng:
- Nhận dạng tiếng Việt bằng Whisper (hỗ trợ model "large-v3", "medium", "small")
- Hỗ trợ 2 chế độ:
    1. Chế độ offline: Dùng thư viện `whisper` chạy trên máy (GPU / CPU)
    2. Chế độ online: Gọi API OpenAI Whisper (`v1/audio/transcriptions`)
- Trích xuất danh sách segment chi tiết: {start, end, speaker, text}
- Tuân thủ nguyên tắc: Nếu không có diarization, ghi rõ "[Người nói chưa phân biệt]"
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .utils import format_time, logger

class AudioTranscriber:
    """Bộ chuyển đổi giọng nói thành văn bản có mốc thời gian và định danh người nói."""

    def __init__(
        self,
        mode: str = "offline",
        model_size: str = "large-v3",
        language: str = "vi",
        api_key: Optional[str] = None,
        device: str = "auto",
        demo_fallback: bool = False,
    ):
        self.mode = mode.lower()
        self.model_size = model_size
        self.language = language
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.device = device
        self.demo_fallback = demo_fallback

    def transcribe(
        self,
        audio_path: Union[str, Path],
        speaker_mapping: Optional[Dict[str, str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Nhận dạng âm thanh và trả về danh sách phân đoạn (segments).
        Cấu trúc mỗi phần tử:
        {
            "start": float (giây),
            "end": float (giây),
            "start_fmt": str ("HH:MM:SS"),
            "end_fmt": str ("HH:MM:SS"),
            "speaker": str,
            "text": str
        }
        """
        audio_file = Path(audio_path)
        if not audio_file.exists():
            raise FileNotFoundError(f"Không tìm thấy file ghi âm: {audio_path}")

        logger.info(
            f"Bắt đầu nhận dạng ASR cho: {audio_file.name} (Chế độ: {self.mode}, Model: {self.model_size})"
        )

        try:
            if self.mode == "online":
                return self._transcribe_online(audio_file)
            else:
                return self._transcribe_offline(audio_file)
        except (ImportError, Exception) as e_asr:
            if self.demo_fallback:
                logger.warning(f"Lỗi nhận dạng ({e_asr}). Kích hoạt dữ liệu phân đoạn mẫu (Demo Fallback) cho kiểm thử...")
                return self._get_demo_segments()
            raise e_asr

    def _get_demo_segments(self) -> List[Dict[str, Any]]:
        """Dữ liệu phân đoạn gỡ băng mẫu phục vụ chạy thử nghiệm quy trình."""
        return [
            {
                "start": 12.0,
                "end": 45.0,
                "start_fmt": "00:00:12",
                "end_fmt": "00:00:45",
                "speaker": "Hiệu trưởng",
                "text": "Chào các thầy cô trong Ban Giám hiệu và lãnh đạo các phòng ban. Hôm nay chúng ta họp về lộ trình tự chủ tài chính và đề án tuyển sinh 2027.",
            },
            {
                "start": 50.0,
                "end": 130.0,
                "start_fmt": "00:00:50",
                "end_fmt": "00:02:10",
                "speaker": "Trưởng phòng Kế hoạch - Tài chính",
                "text": "Báo cáo Thầy Hiệu trưởng, theo tờ trình DA-TC-02, mức học phí trần khối ngành kỹ thuật dự kiến điều chỉnh tăng 12% theo lộ trình Nghị định 97, đồng thời trích 8% quỹ học bổng.",
            },
            {
                "start": 135.0,
                "end": 210.0,
                "start_fmt": "00:02:15",
                "end_fmt": "00:03:30",
                "speaker": "Trưởng phòng Đào tạo",
                "text": "Về chỉ tiêu, chúng tôi đề xuất bổ sung 200 chỉ tiêu cho ngành Vi mạch Bán dẫn và mở mới chuyên ngành AI Ứng dụng. Tuy nhiên cần đầu tư thêm 3 phòng thí nghiệm.",
            },
            {
                "start": 215.0,
                "end": 280.0,
                "start_fmt": "00:03:35",
                "end_fmt": "00:04:40",
                "speaker": "Hiệu trưởng",
                "text": "Tôi kết luận đồng ý chủ trương tăng chỉ tiêu ngành Vi mạch. Giao Phòng Đào tạo hoàn thiện đề án trước ngày 15/10/2026. Phòng Tài chính xây dựng dự toán gói học bổng 50 tỷ đồng trước ngày 20/10/2026.",
            }
        ]

    def _transcribe_offline(self, audio_file: Path) -> List[Dict[str, Any]]:
        """Nhận dạng sử dụng Whisper cục bộ."""
        try:
            import whisper
            import torch
        except ImportError:
            raise ImportError(
                "Để chạy chế độ offline, vui lòng cài đặt: pip install openai-whisper torch"
            )

        if self.device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            device = self.device

        logger.info(f"Đang tải Whisper model '{self.model_size}' trên thiết bị: {device}...")
        model = whisper.load_model(self.model_size, device=device)

        logger.info("Đang thực hiện nhận dạng âm thanh...")
        result = model.transcribe(
            str(audio_file),
            language=self.language,
            verbose=False,
            temperature=0.0,
            initial_prompt="Cuộc họp lãnh đạo đại học, Ban Giám hiệu, quy chế đào tạo, tự chủ đại học, học phí.",
        )

        segments_raw = result.get("segments", [])
        return self._format_segments(segments_raw)

    def _transcribe_online(self, audio_file: Path) -> List[Dict[str, Any]]:
        """Nhận dạng sử dụng OpenAI Whisper API."""
        if not self.api_key:
            raise ValueError("Chế độ online yêu cầu OPENAI_API_KEY được thiết lập trong môi trường.")

        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("Vui lòng cài đặt thư viện openai: pip install openai")

        client = OpenAI(api_key=self.api_key)
        logger.info("Gửi file ghi âm lên OpenAI Whisper API...")

        with open(audio_file, "rb") as f:
            response = client.audio.transcriptions.create(
                file=f,
                model="whisper-1",
                language=self.language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
                prompt="Biên bản cuộc họp Ban Giám hiệu trường đại học.",
            )

        # Chuyển đổi đối tượng phản hồi thành dict
        resp_dict = response.model_dump() if hasattr(response, "model_dump") else dict(response)
        segments_raw = resp_dict.get("segments", [])

        if not segments_raw and "text" in resp_dict:
            # Fallback nếu API trả về văn bản toàn cục
            return [
                {
                    "start": 0.0,
                    "end": 0.0,
                    "start_fmt": "00:00:00",
                    "end_fmt": "00:00:00",
                    "speaker": "[Người nói chưa phân biệt]",
                    "text": resp_dict["text"].strip(),
                }
            ]

        return self._format_segments(segments_raw)

    def _format_segments(self, raw_segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Chuẩn hóa cấu trúc segment và gán nhãn người nói bảo đảm nguyên tắc."""
        formatted = []
        for seg in raw_segments:
            start_sec = float(seg.get("start", 0.0))
            end_sec = float(seg.get("end", 0.0))
            text = seg.get("text", "").strip()

            # Nếu có diarization từ model thì giữ nguyên, ngược lại ghi rõ chưa phân biệt
            speaker = seg.get("speaker")
            if not speaker or speaker.strip() == "":
                speaker = "[Người nói chưa phân biệt]"

            if text:
                formatted.append({
                    "start": start_sec,
                    "end": end_sec,
                    "start_fmt": format_time(start_sec),
                    "end_fmt": format_time(end_sec),
                    "speaker": speaker,
                    "text": text,
                })

        logger.info(f"Hoàn thành nhận dạng ASR. Đã xử lý {len(formatted)} phân đoạn lời thoại.")
        return formatted
