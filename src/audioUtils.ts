/**
 * Tiện ích âm thanh và xử lý WAV 16kHz tiêu chuẩn cho trình duyệt.
 */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Sinh file WAV chuẩn 16kHz, mono, PCM 16-bit ngay trong bộ nhớ trình duyệt.
 * Mô phỏng giọng nói lãnh đạo đại học với các dải tần số 220Hz, 440Hz, 880Hz.
 */
export function generateSyntheticWavBlob(durationSeconds: number = 8): Blob {
  const sampleRate = 16000;
  const numSamples = Math.max(sampleRate * 2, sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF Header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk length
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // 1 kênh (Mono)
  view.setUint32(24, sampleRate, true); // 16000 Hz
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Tổng hợp âm thanh mô phỏng âm hưởng lời nói
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Tần số formant giọng nói nam trung niên (220Hz cơ bản + họa âm 440Hz, 880Hz)
    const voiceTone =
      0.5 * Math.sin(2 * Math.PI * 220 * t) +
      0.3 * Math.sin(2 * Math.PI * 440 * t) +
      0.15 * Math.sin(2 * Math.PI * 880 * t);
    // Điều chế nhịp thở và ngắt câu (0.4 Hz - 1 Hz)
    const pauseEnvelope = Math.max(
      0,
      Math.sin(2 * Math.PI * 0.4 * t) * Math.cos(2 * Math.PI * 0.15 * t)
    );
    const sampleVal = Math.max(
      -32767,
      Math.min(32767, voiceTone * pauseEnvelope * 18000)
    );
    view.setInt16(offset, sampleVal, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Tìm kiếm mimeType tương thích nhất với trình duyệt hiện hành.
 */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidateTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
    ''
  ];
  for (const t of candidateTypes) {
    if (!t || MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}
