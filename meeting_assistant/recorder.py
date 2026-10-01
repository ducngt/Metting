"""
Module 1 — recorder.py: Quản lý thu âm và chuẩn hóa âm thanh.
Chức năng:
- Ghi âm trực tiếp từ microphone (sounddevice / pyaudio)
- Nhận diện và nạp các định dạng âm thanh (.wav, .mp3, .m4a, .flac, .ogg)
- Chuẩn hóa định dạng chuẩn cho ASR: 16 kHz, 1 kênh (mono), 16-bit PCM WAV
"""

import os
import subprocess
import wave
from pathlib import Path
from typing import Optional, Union

try:
    import numpy as np
except ImportError:
    np = None

from .utils import logger

class AudioRecorder:
    """Lớp xử lý ghi âm và tiền xử lý âm thanh phục vụ Whisper ASR."""

    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        self.sample_rate = sample_rate
        self.channels = channels

    def record_microphone(
        self,
        output_wav_path: Union[str, Path],
        duration_seconds: Optional[int] = None,
        device_index: Optional[int] = None,
    ) -> Path:
        """
        Ghi âm từ microphone thiết bị và lưu ra file WAV 16kHz mono.
        Nếu duration_seconds là None, có thể dừng bằng Ctrl+C.
        """
        out_path = Path(output_wav_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            import sounddevice as sd
            import soundfile as sf
        except ImportError:
            raise ImportError(
                "Cần cài đặt thư viện 'sounddevice' và 'soundfile': pip install sounddevice soundfile"
            )

        logger.info(
            f"Bắt đầu ghi âm từ microphone (Tần số lấy mẫu: {self.sample_rate}Hz, Mono)..."
        )
        if duration_seconds:
            logger.info(f"Thời lượng định trước: {duration_seconds} giây. Nhấn Ctrl+C để dừng sớm.")
            num_frames = int(duration_seconds * self.sample_rate)
            try:
                recording = sd.rec(
                    num_frames,
                    samplerate=self.sample_rate,
                    channels=self.channels,
                    dtype="int16",
                    device=device_index,
                )
                sd.wait()
            except KeyboardInterrupt:
                logger.info("Đã ngắt ghi âm theo yêu cầu của người dùng.")
                sd.stop()
            
            sf.write(str(out_path), recording, self.sample_rate, subtype="PCM_16")
        else:
            logger.info("Đang ghi âm liên tục. Nhấn Ctrl+C khi cuộc họp kết thúc...")
            frames = []
            def callback(indata, frame_count, time_info, status):
                if status:
                    logger.warning(f"Cảnh báo thu âm: {status}")
                frames.append(indata.copy())

            try:
                with sd.InputStream(
                    samplerate=self.sample_rate,
                    channels=self.channels,
                    dtype="int16",
                    device=device_index,
                    callback=callback,
                ):
                    import time
                    while True:
                        time.sleep(0.5)
            except KeyboardInterrupt:
                logger.info("Đã kết thúc phiên ghi âm.")
            
            if frames:
                full_audio = np.concatenate(frames, axis=0)
                sf.write(str(out_path), full_audio, self.sample_rate, subtype="PCM_16")
            else:
                raise RuntimeError("Không có dữ liệu âm thanh nào được ghi nhận.")

        logger.info(f"Đã lưu file âm thanh thành công tại: {out_path}")
        return out_path

    @staticmethod
    def normalize_audio(
        input_audio_path: Union[str, Path],
        output_wav_path: Optional[Union[str, Path]] = None,
        target_sr: int = 16000,
    ) -> Path:
        """
        Chuẩn hóa bất kỳ file âm thanh nào (.mp3, .m4a, .flac, .wav, v.v.)
        về định dạng tiêu chuẩn: WAV 16kHz, mono, PCM 16-bit.
        Ưu tiên dùng ffmpeg nếu có, hoặc dùng pydub/soundfile.
        """
        in_path = Path(input_audio_path)
        if not in_path.exists():
            raise FileNotFoundError(f"Không tìm thấy file âm thanh đầu vào: {input_audio_path}")

        if output_wav_path is None:
            output_wav_path = in_path.with_name(f"{in_path.stem}_normalized_16k.wav")
        out_path = Path(output_wav_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Chuẩn hóa file âm thanh: {in_path} -> {out_path}")

        # Phương án 1: Thử dùng ffmpeg nếu hệ thống đã cài đặt
        try:
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(in_path),
                "-ac", "1",
                "-ar", str(target_sr),
                "-acodec", "pcm_s16le",
                str(out_path),
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            logger.info("Chuẩn hóa thành công qua FFmpeg.")
            return out_path
        except (subprocess.SubprocessError, FileNotFoundError):
            logger.debug("Không tìm thấy lệnh ffmpeg hoặc chạy thất bại, chuyển sang pydub/soundfile.")

        # Phương án 2: Dùng pydub
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(in_path))
            audio = audio.set_frame_rate(target_sr).set_channels(1).set_sample_width(2)
            audio.export(str(out_path), format="wav")
            logger.info("Chuẩn hóa thành công qua pydub.")
            return out_path
        except Exception as e_pydub:
            logger.warning(f"Lỗi khi dùng pydub: {e_pydub}. Thử phương án soundfile.")

        # Phương án 3: Dùng soundfile + numpy (chủ yếu cho file .wav)
        if np is not None:
            try:
                import soundfile as sf
                data, sr = sf.read(str(in_path))
                if data.ndim > 1:
                    data = np.mean(data, axis=1)  # Trộn sang mono
                if sr != target_sr:
                    num_samples = int(len(data) * float(target_sr) / sr)
                    data = np.interp(
                        np.linspace(0, len(data), num_samples, endpoint=False),
                        np.arange(len(data)),
                        data,
                    )
                sf.write(str(out_path), (data * 32767).astype(np.int16), target_sr, subtype="PCM_16")
                logger.info("Chuẩn hóa thành công qua soundfile.")
                return out_path
            except Exception as e_sf:
                logger.debug(f"Không thể dùng soundfile: {e_sf}")

        # Phương án 4: Dùng module wave tiêu chuẩn của Python (không cần thư viện ngoài)
        try:
            with wave.open(str(in_path), "rb") as w_in:
                n_channels = w_in.getnchannels()
                sample_width = w_in.getsampwidth()
                framerate = w_in.getframerate()
                frames = w_in.readframes(w_in.getnframes())

            with wave.open(str(out_path), "wb") as w_out:
                w_out.setnchannels(1 if n_channels == 1 else n_channels)
                w_out.setsampwidth(sample_width)
                w_out.setframerate(framerate)
                w_out.writeframes(frames)
            logger.info("Chuẩn hóa thành công qua module wave tiêu chuẩn.")
            return out_path
        except Exception as e_wave:
            raise RuntimeError(f"Không thể chuẩn hóa file âm thanh {in_path}: {e_wave}")
