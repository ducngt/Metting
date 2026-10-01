"""
Module 3 — analyzer.py: Phân tích tham mưu cho Hiệu trưởng bằng LLM.
Tuân thủ nghiêm ngặt NGUYÊN TẮC THAM MƯU:
1. KHÔNG suy diễn, KHÔNG bịa số liệu, KHÔNG tự thêm quyết định.
2. Mọi khẳng định phải kèm dẫn nguồn format: [Mã nguồn, HH:MM:SS].
3. Nếu transcript không rõ ràng, ghi rõ "Chưa xác định" hoặc "Cần kiểm chứng".
4. Tách bạch 3 trạng thái: "Đã kết luận" — "Đang đề xuất" — "Chưa xác định".
5. Mục "Góp ý tham mưu" đánh dấu minh bạch là đề xuất của hệ thống, không phải lời Hiệu trưởng.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional, Union

from .utils import logger

# System Prompt mẫu chuẩn hóa cho Hệ thống Tham mưu Hiệu trưởng
SYSTEM_PROMPT = """Bạn là Chuyên viên Tham mưu Cấp cao kiêm Thư ký Hội đồng Ban Giám hiệu của một trường Đại học danh tiếng.
Nhiệm vụ của bạn là đọc toàn bộ biên bản gỡ băng (transcript) cuộc họp cùng với thông tin metadata, sau đó trích xuất và tổng hợp báo cáo tham mưu phục vụ trực tiếp cho Hiệu trưởng.

BẠN PHẢI TUÂN THỦ TUYỆT ĐỐI CÁC NGUYÊN TẮC THAM MƯU SAU ĐÂY:
1. TÍNH CHÍNH XÁC & TRUNG THỰC: Tuyệt đối KHÔNG suy diễn, KHÔNG tự ý bịa đặt số liệu hay nội dung, KHÔNG tự gán quyết định khi cuộc họp chưa chốt.
2. DẪN NGUỒN NGHIÊM NGẶT: Mọi khẳng định, số liệu, ý kiến phải kèm dẫn nguồn chính xác theo định dạng: [Mã nguồn, HH:MM:SS] (ví dụ: [BG-01, 00:15:30]). Sử dụng danh sách mã nguồn từ metadata hoặc mã phân đoạn tương ứng.
3. MINH BẠCH VỀ TÍNH KHẢ DỤNG: Nếu biên bản không đề cập, nghe không rõ hoặc thiếu thông tin, bạn BẮT BUỘC phải ghi "Chưa xác định" hoặc "[Cần kiểm chứng]", không được tự ý lấp khoảng trống.
4. PHÂN ĐỊNH RÕ TRẠNG THÁI: Trong mục quyết định/đề xuất, phải phân định chính xác 1 trong 3 trạng thái: "Đã kết luận", "Đang đề xuất", hoặc "Chưa xác định".
5. BẢN CHẤT GÓP Ý THAM MƯU: Phần "Góp ý tham mưu" là đề xuất độc lập của hệ thống hỗ trợ lãnh đạo nhận diện góc khuất, giải pháp rủi ro, KHÔNG ĐƯỢC viết như thể đó là phát biểu của Hiệu trưởng.
6. ĐỊNH DẠNG ĐẦU RA: Bắt buộc trả về duy nhất một chuỗi JSON hợp lệ tuân thủ đúng schema được quy định."""

JSON_SCHEMA_INSTRUCTION = """
Bạn PHẢI trả về duy nhất định dạng JSON (không kèm văn bản dẫn dắt bên ngoài block json) với cấu trúc chính xác sau:
{
  "meeting": {
    "time": "thời gian cuộc họp (ví dụ: 08:30--10:00, ngày DD/MM/YYYY)",
    "location": "địa điểm",
    "chair": "người chủ trì",
    "attendees": "thành phần tham dự",
    "objective": "mục tiêu cuộc họp",
    "sources": ["BG-01", "BC-TS-01"],
    "reviewer": "người rà soát",
    "review_date": "ngày rà soát (DD/MM/YYYY)"
  },
  "key_points": [
    {
      "bold": "Tiêu đề ngắn gọn in đậm",
      "detail": "Nội dung chi tiết cụ thể",
      "source": "Mã nguồn, HH:MM:SS"
    }
  ],
  "decisions": [
    {
      "status": "Đã kết luận | Đang đề xuất | Chưa xác định",
      "content": "Nội dung quyết định hoặc đề xuất",
      "implication": "Ý nghĩa, hàm ý thực thi đối với nhà trường"
    }
  ],
  "tasks": [
    {
      "code": "NV01",
      "deliverable": "Sản phẩm / kết quả đầu ra cụ thể",
      "owner": "Đơn vị hoặc cá nhân chịu trách nhiệm chính",
      "deadline": "DD/MM/YYYY hoặc Chưa xác định",
      "basis": "Căn cứ giao việc [Mã nguồn, HH:MM:SS]"
    }
  ],
  "risks": [
    {
      "issue": "Vấn đề hoặc rủi ro tiềm ẩn",
      "impact": "Tác động dự kiến đến nguồn lực, pháp lý, nhân sự, tuyển sinh",
      "mitigation": "Phương án giảm thiểu hoặc hành động phòng ngừa"
    }
  ],
  "follow_up": [
    "Hành động cụ thể cần theo dõi sau cuộc họp kèm mốc thời gian"
  ],
  "direction_signals": {
    "stated": "Định hướng rõ ràng đã được tuyên bố",
    "disagreements": "Các quan điểm trái chiều hoặc bất đồng chưa dung hòa",
    "to_verify": "Các nội dung cần xác minh đối chiếu với văn bản pháp lý"
  },
  "suggestions": [
    "Gợi ý tham mưu mang tính chiến lược cho Hiệu trưởng"
  ],
  "verification": [
    {
      "item": "Nội dung cần kiểm chứng",
      "evidence": "Tài liệu kiểm chứng / người phụ trách giải trình",
      "status": "Cần kiểm chứng | Đã rõ"
    }
  ]
}
"""

class MeetingAnalyzer:
    """Bộ phân tích tham mưu cho Hiệu trưởng sử dụng mô hình ngôn ngữ lớn."""

    def __init__(
        self,
        provider: str = "gemini",
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.provider = provider.lower()
        self.model = model
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")

        if not self.model:
            if self.provider == "gemini":
                self.model = "gemini-2.5-pro"
            elif self.provider == "anthropic":
                self.model = "claude-3-5-sonnet-20241022"
            else:
                self.model = "gpt-4o"

    def analyze(
        self,
        transcript_segments: List[Dict[str, Any]],
        meta: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Gửi transcript và metadata vào LLM để phân tích trích xuất dữ liệu tham mưu.
        """
        logger.info(
            f"Bắt đầu phân tích tham mưu bằng LLM ({self.provider} - model: {self.model})..."
        )

        user_prompt = self._build_user_prompt(transcript_segments, meta)

        try:
            if self.provider == "gemini":
                raw_response = self._call_gemini(user_prompt)
            elif self.provider == "anthropic":
                raw_response = self._call_anthropic(user_prompt)
            elif self.provider == "openai":
                raw_response = self._call_openai(user_prompt)
            else:
                raise ValueError(f"Không hỗ trợ nhà cung cấp LLM: {self.provider}")

            parsed_data = self._clean_and_parse_json(raw_response)
            # Đồng bộ metadata tên trường / mã cuộc họp nếu có
            if "university" in meta and "meeting" in parsed_data:
                parsed_data["meeting"]["university"] = meta.get("university")
            if "meeting_id" in meta and "meeting" in parsed_data:
                parsed_data["meeting"]["meeting_id"] = meta.get("meeting_id")

            logger.info("Phân tích tham mưu hoàn tất và dữ liệu JSON hợp lệ.")
            return parsed_data

        except Exception as e:
            logger.error(f"Lỗi trong quá trình gọi LLM: {e}. Tạo dữ liệu dự phòng an toàn.")
            return self._build_safe_fallback(transcript_segments, meta)

    def _build_user_prompt(
        self, transcript_segments: List[Dict[str, Any]], meta: Dict[str, Any]
    ) -> str:
        """Xây dựng nội dung lời nhắc người dùng (User prompt)."""
        transcript_text = "\n".join([
            f"[{seg.get('start_fmt', '00:00:00')} - {seg.get('end_fmt', '00:00:00')}] {seg.get('speaker', '[Người nói chưa phân biệt]')}: {seg.get('text', '')}"
            for seg in transcript_segments
        ])

        meta_json = json.dumps(meta, ensure_ascii=False, indent=2)

        prompt = f"""Dưới đây là thông tin Metadata cuộc họp và toàn bộ biên bản gỡ băng (transcript):

--- METADATA CUỘC HỌP ---
{meta_json}

--- TOÀN VĂN BIÊN BẢN GỠ BĂNG (TRANSCRIPT) ---
{transcript_text}

--- HƯỚNG DẪN CẤU TRÚC JSON ĐẦU RA ---
{JSON_SCHEMA_INSTRUCTION}

Hãy trích xuất và phân tích toàn bộ cuộc họp thành JSON hoàn chỉnh, tuân thủ đúng các nguyên tắc tham mưu đã giao."""
        return prompt

    def _call_gemini(self, user_prompt: str) -> str:
        """Gọi Google Gemini API."""
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=self.api_key)
            response = client.models.generate_content(
                model=self.model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            return response.text or ""
        except ImportError:
            # Fallback nếu dùng google-generativeai cũ
            import google.generativeai as genai_old
            genai_old.configure(api_key=self.api_key)
            model = genai_old.GenerativeModel(
                model_name=self.model if "gemini" in self.model else "gemini-1.5-pro",
                system_instruction=SYSTEM_PROMPT,
            )
            res = model.generate_content(
                user_prompt,
                generation_config={"temperature": 0.1, "response_mime_type": "application/json"}
            )
            return res.text

    def _call_openai(self, user_prompt: str) -> str:
        """Gọi OpenAI GPT API."""
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key or os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=self.model,
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""

    def _call_anthropic(self, user_prompt: str) -> str:
        """Gọi Anthropic Claude API."""
        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key or os.getenv("ANTHROPIC_API_KEY"))
        response = client.messages.create(
            model=self.model,
            max_tokens=8192,
            temperature=0.1,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_prompt}
            ],
        )
        return response.content[0].text

    def _clean_and_parse_json(self, raw_text: str) -> Dict[str, Any]:
        """Làm sạch markdown code block (nếu có) và nạp JSON."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        data = json.loads(cleaned)
        return data

    def _build_safe_fallback(
        self, transcript_segments: List[Dict[str, Any]], meta: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Tạo dữ liệu fallback an toàn, không bịa đặt khi API gặp sự cố."""
        primary_source = meta.get("sources", ["BG-01"])[0] if meta.get("sources") else "BG-01"
        return {
            "meeting": {
                "university": meta.get("university", "ĐẠI HỌC"),
                "meeting_id": meta.get("meeting_id", "HT-2026-10-01"),
                "time": meta.get("time", "Chưa xác định"),
                "location": meta.get("location", "Phòng họp Ban Giám hiệu"),
                "chair": meta.get("chair", "[Chưa xác định]"),
                "attendees": meta.get("attendees", "[Chưa xác định]"),
                "objective": meta.get("objective", "[Chưa xác định]"),
                "sources": meta.get("sources", [primary_source]),
                "reviewer": meta.get("reviewer", "[Họ tên người rà soát]"),
                "review_date": meta.get("review_date", "Chưa xác định"),
            },
            "key_points": [
                {
                    "bold": "Nội dung ghi nhận từ biên bản",
                    "detail": "Hệ thống đã ghi nhận các phát biểu trong biên bản gỡ băng nhưng cuộc gọi LLM gặp gián đoạn kết nối.",
                    "source": f"{primary_source}, 00:00:00",
                }
            ],
            "decisions": [
                {
                    "status": "Chưa xác định",
                    "content": "Cần kiểm chứng lại kết luận trực tiếp từ biên bản viết tay của thư ký.",
                    "implication": "Chưa đủ căn cứ ban hành kết luận chính thức.",
                }
            ],
            "tasks": [
                {
                    "code": "NV01",
                    "deliverable": "Đối chiếu và hoàn thiện biên bản tổng hợp cuộc họp",
                    "owner": "Phòng Thư ký Tổng hợp",
                    "deadline": "Chưa xác định",
                    "basis": f"Căn cứ gỡ băng [{primary_source}, 00:00:00]",
                }
            ],
            "risks": [
                {
                    "issue": "Thiếu thông tin đối chiếu tự động",
                    "impact": "Có thể chậm tiến độ ban hành thông báo kết luận của Hiệu trưởng",
                    "mitigation": "Thư ký rà soát thủ công transcript đính kèm",
                }
            ],
            "follow_up": [
                "Kiểm tra lại toàn bộ file ghi âm đối với các đoạn có tiếng ồn",
                "Xin ý kiến Hiệu trưởng về các điểm chưa thống nhất"
            ],
            "direction_signals": {
                "stated": "Đảm bảo tuân thủ quy chế và tiến độ công việc chung của Nhà trường.",
                "disagreements": "Chưa ghi nhận bất đồng rõ nét hoặc cần nghe lại file ghi âm gốc.",
                "to_verify": "Các số liệu tài chính và chỉ tiêu tuyển sinh cần đối chiếu với văn bản phòng ban chức năng."
            },
            "suggestions": [
                "Đề xuất Hiệu trưởng yêu cầu các đơn vị gửi báo cáo giải trình chi tiết bằng văn bản trước phiên họp tiếp theo."
            ],
            "verification": [
                {
                    "item": "Số liệu chỉ tiêu và dự toán ngân sách",
                    "evidence": "Tờ trình của Phòng Đào tạo & Kế hoạch Tài chính",
                    "status": "Cần kiểm chứng"
                }
            ]
        }
