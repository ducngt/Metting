/**
 * Meeting Intelligence - Hệ thống hỗ trợ họp và tham mưu cho Hiệu trưởng đại học
 * Phân tích trực tiếp từ file ghi âm thực tế và xuất bản biên bản XeLaTeX tiếng Việt chuẩn mực.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Upload,
  FileText,
  Download,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Building,
  FileCode,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Loader2,
  Trash2,
  Cpu,
  Key,
  SlidersHorizontal,
  X,
  Info,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';

import { MeetingAnalysis, MeetingMetadata, TranscriptSegment } from './types';
import { DEFAULT_METADATA } from './sampleData';
import { generateXeLatex } from './latexGenerator';
import { getSupportedMimeType } from './audioUtils';

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  envVar: string;
  supportsDirectAudio: boolean;
  models: string[];
  defaultModel: string;
  description: string;
}

const DEFAULT_PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    configured: true,
    envVar: 'GEMINI_API_KEY',
    supportsDirectAudio: true,
    models: ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'],
    defaultModel: 'gemini-flash-latest',
    description: 'Mặc định • Nhận diện âm thanh trực tiếp và phân tích 9 phần đa phương thức.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    configured: false,
    envVar: 'DEEPSEEK_API_KEY',
    supportsDirectAudio: false,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    description: 'Mô hình lập luận logic sâu sắc • Phân tích tham mưu chuyên sâu cho Hiệu trưởng.',
  },
  {
    id: 'grok',
    name: 'xAI Grok',
    configured: false,
    envVar: 'GROK_API_KEY',
    supportsDirectAudio: false,
    models: ['grok-2-latest', 'grok-beta'],
    defaultModel: 'grok-2-latest',
    description: 'Mô hình Grok của xAI • Đánh giá rủi ro sắc sảo và khách quan.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    configured: false,
    envVar: 'OPENAI_API_KEY',
    supportsDirectAudio: true,
    models: ['gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4o',
    description: 'OpenAI Whisper gỡ băng tiếng Việt + GPT-4o phân tích tham mưu.',
  },
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'pipeline' | 'metadata' | 'report' | 'latex' | 'cli'
  >('pipeline');

  const [metadata, setMetadata] = useState<MeetingMetadata>(DEFAULT_METADATA);
  // Không nạp sẵn bất kỳ dữ liệu mẫu nào - chỉ hiển thị dữ liệu từ audio thật
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [analysis, setAnalysis] = useState<MeetingAnalysis | null>(null);

  // Bộ chọn mô hình AI (Multi-Provider)
  const [providers, setProviders] = useState<ProviderInfo[]>(DEFAULT_PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-flash-latest');
  const [showKeyConfigModal, setShowKeyConfigModal] = useState<boolean>(false);

  // Nhập Key trực tiếp trên giao diện
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({
    deepseek: '',
    grok: '',
    openai: '',
  });
  const [showKeyVisible, setShowKeyVisible] = useState<Record<string, boolean>>({
    deepseek: false,
    grok: false,
    openai: false,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveKeyMessage, setSaveKeyMessage] = useState<{
    provider: string;
    text: string;
    success: boolean;
  } | null>(null);

  const handleSaveKey = async (provId: string) => {
    const keyVal = keyInputs[provId]?.trim();
    setSavingKey(provId);
    setSaveKeyMessage(null);

    try {
      const res = await fetch('/api/config/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provId,
          apiKey: keyVal,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveKeyMessage({
          provider: provId,
          text: data.message || 'Đã lưu và kích hoạt khóa thành công!',
          success: true,
        });

        // Cập nhật lại trạng thái providers trên giao diện
        const provRes = await fetch('/api/providers');
        const provData = await provRes.json();
        if (provData.providers) {
          setProviders(provData.providers);
        }
      } else {
        throw new Error(data.error || 'Không thể lưu khóa API.');
      }
    } catch (err: any) {
      setSaveKeyMessage({
        provider: provId,
        text: err.message || 'Lỗi khi lưu khóa API.',
        success: false,
      });
    } finally {
      setSavingKey(null);
    }
  };

  // Thu âm state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([15, 25, 40, 60, 40, 20, 35, 50, 65, 45, 25, 15]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Trạng thái xử lý
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [copiedTex, setCopiedTex] = useState(false);

  // Sinh mã XeLaTeX thời gian thực
  const [latexSource, setLatexSource] = useState('');

  useEffect(() => {
    setLatexSource(generateXeLatex(analysis, metadata));
  }, [metadata, analysis]);

  // Nạp trạng thái các nhà cung cấp AI từ server
  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((data) => {
        if (data.providers) {
          setProviders(data.providers);
          const current = data.providers.find((p: ProviderInfo) => p.id === selectedProvider);
          if (current && current.defaultModel) {
            setSelectedModel(current.defaultModel);
          }
        }
      })
      .catch((e) => console.warn('Không thể nạp danh sách providers:', e));
  }, []);

  const handleSelectProvider = (provId: string) => {
    setSelectedProvider(provId);
    const prov = providers.find((p) => p.id === provId);
    if (prov && prov.models && prov.models.length > 0) {
      setSelectedModel(prov.defaultModel || prov.models[0]);
    }
  };

  // Quản lý ghi âm Microphone thực tế
  const startRecording = async () => {
    setRecordError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRecordError("Trình duyệt không hỗ trợ trực tiếp Microphone trong ngữ cảnh hiện tại. Bạn vui lòng sử dụng tính năng tải file ghi âm cuộc họp.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Thiết lập Web Audio Analyser để hiển thị sóng âm thật
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevels = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              const slice = Array.from(dataArray.slice(0, 12)).map(v => Math.max(10, Math.min(100, Math.round((v / 255) * 100))));
              setAudioLevels(slice);
              animFrameRef.current = requestAnimationFrame(updateLevels);
            }
          };
          updateLevels();
        }
      } catch (eCtx) {
        console.warn("Không thể kích hoạt Analyser:", eCtx);
      }

      const mimeType = getSupportedMimeType();
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioFileName(`Ghi_am_truc_tiep_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Không thể truy cập microphone:', err);
      let errMsg = "Không thể truy cập microphone.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = "Quyền truy cập Microphone bị từ chối hoặc bị hạn chế bởi bảo mật trình duyệt. Vui lòng cấp quyền hoặc tải lên file ghi âm cuộc họp.";
      } else if (err.name === 'NotFoundError') {
        errMsg = "Không tìm thấy thiết bị microphone nào trên thiết bị.";
      } else {
        errMsg = `Lỗi microphone: ${err.message || err.name}.`;
      }
      setRecordError(errMsg);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }

    if (mediaRecorderRef.current && typeof mediaRecorderRef.current.stop === 'function') {
      try {
        if (typeof mediaRecorderRef.current.requestData === 'function') {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn('Lỗi khi dừng mediaRecorder:', e);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioBlob(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFileName(file.name);
      setRecordError(null);
    }
  };

  // Reset xóa trắng phiên họp để bắt đầu cuộc họp mới
  const handleResetSession = () => {
    setSegments([]);
    setAnalysis(null);
    setAudioUrl(null);
    setAudioBlob(null);
    setAudioFileName('');
    setRecordDuration(0);
    setRecordError(null);
  };

  // Thực hiện phân tích file ghi âm thật bằng AI
  const handleAnalyzeRealAudio = async () => {
    if (!audioBlob) {
      setRecordError("Vui lòng ghi âm từ microphone hoặc tải lên file âm thanh cuộc họp trước khi phân tích.");
      return;
    }

    setIsAnalyzing(true);
    setRecordError(null);
    setAnalysisStatus("Đang tải dữ liệu âm thanh và chuyển đổi định dạng...");

    try {
      const base64 = await blobToBase64(audioBlob);
      let mimeType = audioBlob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = audioFileName.split('.').pop()?.toLowerCase();
        if (ext === 'wav') mimeType = 'audio/wav';
        else if (ext === 'mp3') mimeType = 'audio/mp3';
        else if (ext === 'm4a' || ext === 'mp4') mimeType = 'audio/mp4';
        else if (ext === 'ogg') mimeType = 'audio/ogg';
        else if (ext === 'flac') mimeType = 'audio/flac';
        else mimeType = 'audio/webm';
      }

      setAnalysisStatus("Đang nhận dạng giọng nói ASR tiếng Việt và trích xuất mốc thời gian...");

      const res = await fetch('/api/analyze-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: mimeType,
          metadata: metadata,
          provider: selectedProvider,
          model: selectedModel,
          customApiKey: keyInputs[selectedProvider] || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Lỗi máy chủ (${res.status})`);
      }

      setAnalysisStatus("Đang tổng hợp 9 phần báo cáo tham mưu theo nguyên tắc Ban Giám hiệu...");
      const data = await res.json();

      if (data.segments && Array.isArray(data.segments)) {
        setSegments(data.segments);
      }
      setAnalysis(data);
      setActiveTab('report');
    } catch (err: any) {
      console.error("Lỗi khi phân tích âm thanh:", err);
      setRecordError(`Lỗi phân tích: ${err.message || 'Không thể hoàn tất phân tích âm thanh.'}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus("");
    }
  };

  const handleCopyTex = () => {
    navigator.clipboard.writeText(latexSource);
    setCopiedTex(true);
    setTimeout(() => setCopiedTex(false), 2000);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* HEADER BAN LÃNH ĐẠO */}
      <header className="bg-[#17324D] text-white border-b border-slate-700 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-bold text-xl tracking-wider">
              HT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-lg tracking-tight text-white">
                  Meeting Intelligence
                </h1>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-medium">
                  Phân tích âm thanh thật
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {metadata.university} • Mã hồ sơ: {metadata.meeting_id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetSession}
              className="text-xs px-3 py-1.5 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-200 border border-slate-600 transition flex items-center gap-1.5 cursor-pointer"
              title="Xóa trắng dữ liệu để bắt đầu cuộc họp mới"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Phiên họp mới
            </button>
            <button
              onClick={() =>
                downloadFile(latexSource, `${metadata.meeting_id}_report.tex`, 'text/plain')
              }
              className="text-xs px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất file XeLaTeX (.tex)
            </button>
          </div>
        </div>

        {/* THANH ĐIỀU HƯỚNG TABS */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto border-t border-slate-700/60 pt-1">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'pipeline'
                ? 'border-amber-400 text-amber-300 bg-slate-800/50'
                : 'border-transparent text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <Mic className="w-4 h-4" />
            1. Ghi âm & Gỡ băng thực tế
            {audioBlob && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('metadata')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'metadata'
                ? 'border-amber-400 text-amber-300 bg-slate-800/50'
                : 'border-transparent text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <Building className="w-4 h-4" />
            2. Thông tin cuộc họp
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'report'
                ? 'border-amber-400 text-amber-300 bg-slate-800/50'
                : 'border-transparent text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <FileText className="w-4 h-4" />
            3. Bản tham mưu 9 phần
            {analysis && (
              <span className="text-[10px] bg-emerald-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full">
                Sẵn sàng
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('latex')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'latex'
                ? 'border-amber-400 text-amber-300 bg-slate-800/50'
                : 'border-transparent text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <FileCode className="w-4 h-4" />
            4. Mã XeLaTeX (.tex)
          </button>

          <button
            onClick={() => setActiveTab('cli')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'cli'
                ? 'border-amber-400 text-amber-300 bg-slate-800/50'
                : 'border-transparent text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <Terminal className="w-4 h-4" />
            5. CLI & Python Core
          </button>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* BANNER NGUYÊN TẮC THAM MƯU THỰC TẾ */}
        <div className="mb-6 bg-slate-50 border-l-4 border-[#17324D] rounded-r-lg p-3.5 shadow-sm text-xs sm:text-sm text-slate-700 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#17324D] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#17324D]">
              Nguyên tắc tham mưu Ban Giám hiệu (Không dùng dữ liệu giả lập):
            </span>{' '}
            Hệ thống chỉ phân tích dựa trên file âm thanh thực tế do bạn ghi âm hoặc tải lên • Tuyệt đối không tự suy diễn số liệu • Mọi thông tin đều gắn mốc thời gian{' '}
            <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800 font-mono text-xs">
              [HH:MM:SS]
            </code>.
          </div>
        </div>

        {/* TAB 1: GHI ÂM & GỠ BĂNG THỰC TẾ */}
        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            {/* KHỐI CHỌN MÔ HÌNH AI & CẤU HÌNH API KEY */}
            <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
                <div>
                  <h3 className="font-bold text-base text-[#17324D] flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-indigo-600" />
                    Động cơ Mô hình AI Tham mưu (Multi-Provider Engine)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hỗ trợ linh hoạt: Google Gemini, DeepSeek (V3/R1), xAI Grok (Grok-2), và OpenAI (GPT-4o & Whisper).
                  </p>
                </div>
                <button
                  onClick={() => setShowKeyConfigModal(true)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
                >
                  <Key className="w-3.5 h-3.5 text-amber-600" />
                  Cấu hình API Key (Secrets / .env)
                </button>
              </div>

              {/* Lưới chọn nhà cung cấp AI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {providers.map((p) => {
                  const isSelected = selectedProvider === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProvider(p.id)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#17324D] bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900">{p.name}</span>
                          {p.configured ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Sẵn sàng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
                              <Key className="w-2.5 h-2.5" />
                              Cần Key
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">{p.description}</p>
                      </div>

                      {isSelected && (
                        <div className="mt-3 pt-2 border-t border-blue-200/60 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-blue-900">Model:</span>
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-[#17324D]"
                          >
                            {p.models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Thông báo nếu provider chưa có key */}
              {selectedProvider !== 'gemini' && !providers.find((p) => p.id === selectedProvider)?.configured && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Chưa tìm thấy khóa API{' '}
                      <strong>{providers.find((p) => p.id === selectedProvider)?.envVar}</strong> trong biến môi trường máy chủ.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowKeyConfigModal(true)}
                    className="underline font-semibold hover:text-amber-950 shrink-0 cursor-pointer"
                  >
                    Xem hướng dẫn cài đặt key
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cột 1: Thu âm microphone thật hoặc tải file */}
              <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-5 space-y-5">
                <h3 className="font-bold text-base text-[#17324D] flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Mic className="w-5 h-5 text-red-600" />
                  Ghi âm cuộc họp thực tế
                </h3>

                {/* Microphone Record Card */}
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-center space-y-3.5">
                  {/* Cảnh báo lỗi nếu có */}
                  {recordError && (
                    <div className="bg-amber-50 border border-amber-300 rounded p-2.5 text-xs text-amber-900 text-left space-y-1.5">
                      <div className="flex items-start gap-1.5 font-semibold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{recordError}</span>
                      </div>
                    </div>
                  )}

                  {/* Vòng tròn ghi âm & Animation sóng âm thực tế */}
                  <div className="flex items-center justify-center">
                    {isRecording ? (
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40 animate-pulse">
                          <Mic className="w-8 h-8" />
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 border-2 border-white"></span>
                        </span>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-[#17324D] text-white flex items-center justify-center shadow-md">
                        <Mic className="w-8 h-8 text-amber-300" />
                      </div>
                    )}
                  </div>

                  {/* Sóng âm thanh thật khi người dùng nói */}
                  {isRecording ? (
                    <div className="space-y-1">
                      <div className="flex items-end justify-center gap-1.5 h-10 px-2 bg-slate-100 rounded border border-slate-200 py-1">
                        {audioLevels.map((lvl, idx) => (
                          <div
                            key={idx}
                            style={{ height: `${lvl}%` }}
                            className="w-1.5 bg-red-600 rounded-t transition-all duration-75"
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-red-600 font-semibold animate-pulse">
                        Đang ghi âm tín hiệu microphone thực tế...
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Chuẩn hóa luồng âm thanh đầu vào cho ASR
                    </p>
                  )}

                  <div className="font-mono text-2xl font-bold text-slate-800 tracking-wider">
                    {formatTimer(recordDuration)}
                  </div>

                  {/* Nút bấm Ghi âm thật */}
                  <div>
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow transition cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        Bắt đầu ghi âm từ Microphone
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="w-full py-2.5 bg-slate-900 hover:bg-black text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer transition"
                      >
                        <MicOff className="w-4 h-4 text-red-400" />
                        Dừng ghi âm & Lưu băng
                      </button>
                    )}
                  </div>
                </div>

                {/* Upload File Audio thật */}
                <div className="border-t border-slate-200 pt-4 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    Hoặc tải lên file ghi âm thực tế (.wav, .mp3, .m4a):
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#17324D] rounded-lg p-3.5 cursor-pointer bg-slate-50 hover:bg-slate-100 transition">
                    <Upload className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-xs text-slate-600 font-medium">
                      Nhấn để tải lên file ghi âm
                    </span>
                    <span className="text-[11px] text-slate-400">Hỗ trợ các định dạng âm thanh tiêu chuẩn</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Audio Player Preview khi có file thật */}
                {audioUrl && (
                  <div className="border-t border-slate-200 pt-4 space-y-2.5 bg-blue-50/50 p-3 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5 truncate max-w-[200px]" title={audioFileName}>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        {audioFileName || 'File ghi âm cuộc họp'}
                      </span>
                      <button
                        onClick={handleResetSession}
                        className="text-xs text-red-600 hover:text-red-700 p-1 cursor-pointer"
                        title="Hủy file này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <audio
                      ref={audioPlayerRef}
                      src={audioUrl}
                      controls
                      className="w-full h-8 rounded"
                    />

                    {/* Nút bấm Phân tích file ghi âm thật */}
                    <button
                      onClick={handleAnalyzeRealAudio}
                      disabled={isAnalyzing}
                      className="w-full py-2.5 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow transition cursor-pointer disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                          <span>Đang xử lý phân tích...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>Gỡ băng ASR & Phân tích file ghi âm này</span>
                        </>
                      )}
                    </button>

                    {analysisStatus && (
                      <p className="text-[11px] text-slate-600 italic text-center animate-pulse">
                        {analysisStatus}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Cột 2 & 3: Danh sách phân đoạn Whisper ASR thực tế */}
              <div className="lg:col-span-2 bg-white rounded-lg border border-slate-300 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <h3 className="font-bold text-base text-[#17324D] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Biên bản gỡ băng ASR thực tế ({segments.length} phân đoạn)
                  </h3>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-mono">
                    Trích xuất từ file ghi âm
                  </span>
                </div>

                {segments.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-3">
                    <FileText className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
                    <p className="text-sm font-medium text-slate-600">
                      Chưa có dữ liệu gỡ băng
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Hãy ghi âm từ microphone hoặc tải lên file âm thanh thực tế ở cột bên trái, sau đó nhấn "Gỡ băng ASR & Phân tích" để hệ thống chuyển giọng nói thành văn bản.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                    {segments.map((seg, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition text-sm space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {seg.speaker}
                          </span>
                          <span className="font-mono text-slate-500 font-medium">
                            {seg.start_fmt} → {seg.end_fmt}
                          </span>
                        </div>
                        <p className="text-slate-800 leading-relaxed pt-1">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: METADATA CUỘC HỌP */}
        {activeTab === 'metadata' && (
          <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-6 max-w-4xl mx-auto space-y-6">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#17324D]">
                  Cấu hình Thông tin Cuộc họp thực tế (meta.json)
                </h3>
                <p className="text-xs text-slate-500">
                  Nhập thông tin xác thực để hiển thị trên tiêu đề văn bản, đầu trang và chân trang XeLaTeX.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên trường / Cơ quan
                </label>
                <input
                  type="text"
                  value={metadata.university}
                  onChange={(e) => setMetadata({ ...metadata, university: e.target.value })}
                  placeholder="Ví dụ: ĐẠI HỌC BÁCH KHOA HÀ NỘI"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã cuộc họp
                </label>
                <input
                  type="text"
                  value={metadata.meeting_id}
                  onChange={(e) => setMetadata({ ...metadata, meeting_id: e.target.value })}
                  placeholder="Ví dụ: HT-2026-10-01"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tiêu đề cuộc họp
                </label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                  placeholder="Ví dụ: Họp Ban Giám hiệu về Chiến lược Đào tạo và Tự chủ"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Thời gian
                </label>
                <input
                  type="text"
                  value={metadata.time}
                  onChange={(e) => setMetadata({ ...metadata, time: e.target.value })}
                  placeholder="Ví dụ: 08:30--11:00, ngày 01/10/2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Địa điểm
                </label>
                <input
                  type="text"
                  value={metadata.location}
                  onChange={(e) => setMetadata({ ...metadata, location: e.target.value })}
                  placeholder="Ví dụ: Phòng họp Ban Giám hiệu"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chủ trì cuộc họp
                </label>
                <input
                  type="text"
                  value={metadata.chair}
                  onChange={(e) => setMetadata({ ...metadata, chair: e.target.value })}
                  placeholder="Ví dụ: PGS. TS. Huỳnh Quyết Thắng - Hiệu trưởng"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Người rà soát nội dung
                </label>
                <input
                  type="text"
                  value={metadata.reviewer}
                  onChange={(e) => setMetadata({ ...metadata, reviewer: e.target.value })}
                  placeholder="Ví dụ: Thư ký Hội đồng Ban Giám hiệu"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Thành phần tham dự
                </label>
                <textarea
                  rows={2}
                  value={metadata.attendees}
                  onChange={(e) => setMetadata({ ...metadata, attendees: e.target.value })}
                  placeholder="Ví dụ: Ban Giám hiệu, Trưởng các Phòng, Ban, Viện trưởng..."
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mục tiêu cuộc họp
                </label>
                <textarea
                  rows={2}
                  value={metadata.objective}
                  onChange={(e) => setMetadata({ ...metadata, objective: e.target.value })}
                  placeholder="Ví dụ: Thống nhất các phương án trọng tâm..."
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#17324D] focus:outline-none text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() =>
                  downloadFile(
                    JSON.stringify(metadata, null, 2),
                    'meta.json',
                    'application/json'
                  )
                }
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded text-xs font-semibold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Tải file meta.json
              </button>
              <button
                onClick={() => setActiveTab('pipeline')}
                className="px-4 py-2 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                Tiếp tục thu âm / gỡ băng
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: BẢN THAM MƯU 9 PHẦN TỪ AUDIO THỰC TẾ */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {!analysis ? (
              <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-12 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#17324D]">
                  Chưa có kết quả phân tích từ file ghi âm thật
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Để đảm bảo tính xác thực, hệ thống không dùng dữ liệu dựng sẵn. Vui lòng ghi âm từ microphone hoặc tải lên file âm thanh (.wav, .mp3, .m4a) của cuộc họp thực tế để hệ thống tiến hành ASR và phân tích tham mưu 9 phần.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('pipeline')}
                    className="px-5 py-2.5 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-bold shadow transition cursor-pointer inline-flex items-center gap-2"
                  >
                    <Mic className="w-4 h-4 text-amber-300" />
                    Chuyển đến màn hình Thu âm & Tải file
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Header văn bản */}
                <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-6 text-center">
                  <h2 className="text-xl sm:text-2xl font-bold text-[#17324D] tracking-tight uppercase">
                    BẢN THAM MƯU NỘI DUNG CUỘC HỌP BAN GIÁM HIỆU
                  </h2>
                  <p className="text-sm font-semibold text-slate-600 mt-1 uppercase">
                    PHỤC VỤ CÔNG TÁC ĐIỀU HÀNH CỦA HIỆU TRƯỞNG
                  </p>
                  <p className="text-xs text-slate-600 italic mt-0.5">
                    (Phân tích thực tế từ tệp ghi âm giọng nói • Tuân thủ 5 nguyên tắc tham mưu)
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 bg-[#EDF2F7] px-3.5 py-1.5 rounded-full border border-slate-300 text-xs text-[#17324D]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold">Đã trích xuất từ âm thanh thật:</span> {segments.length} phân đoạn lời thoại có mốc thời gian.
                  </div>
                </div>

                {/* 1. THÔNG TIN CUỘC HỌP */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4 flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        1
                      </span>
                      Thông tin cuộc họp
                    </h3>
                    <span className="text-xs text-slate-600">Mã: {metadata.meeting_id}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                    <div>
                      <span className="font-semibold text-slate-700">Thời gian:</span>{' '}
                      <span className="text-slate-900">{analysis.meeting?.time || metadata.time}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Địa điểm:</span>{' '}
                      <span className="text-slate-900">{analysis.meeting?.location || metadata.location}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Chủ trì:</span>{' '}
                      <span className="text-slate-900 font-medium">{analysis.meeting?.chair || metadata.chair}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Người rà soát:</span>{' '}
                      <span className="text-slate-900">
                        {analysis.meeting?.reviewer || metadata.reviewer} (Ngày: {analysis.meeting?.review_date || metadata.review_date})
                      </span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-semibold text-slate-700">Thành phần:</span>{' '}
                      <span className="text-slate-800">{analysis.meeting?.attendees || metadata.attendees}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-semibold text-slate-700">Mục tiêu:</span>{' '}
                      <span className="text-slate-800">{analysis.meeting?.objective || metadata.objective}</span>
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2">
                      <span className="font-semibold text-slate-700">Mã nguồn dữ liệu:</span>
                      <div className="flex gap-1.5">
                        {(analysis.meeting?.sources || metadata.sources || ['BG-01']).map((s) => (
                          <span
                            key={s}
                            className="bg-slate-100 text-slate-700 border border-slate-300 font-mono text-xs px-2 py-0.5 rounded font-semibold"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. HIỆU TRƯỞNG CẦN NẮM NGAY */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        2
                      </span>
                      Hiệu trưởng cần nắm ngay
                    </h3>
                  </div>
                  {analysis.key_points && analysis.key_points.length > 0 ? (
                    <ul className="space-y-3">
                      {analysis.key_points.map((pt, i) => (
                        <li
                          key={i}
                          className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80 flex items-start gap-2.5 text-sm"
                        >
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-900">{pt.bold}:</span>{' '}
                            <span className="text-slate-800">{pt.detail}</span>{' '}
                            <span className="inline-block bg-slate-200/80 text-slate-600 text-xs px-1.5 py-0.5 rounded font-mono font-medium ml-1">
                              [{pt.source}]
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Không có điểm cảnh báo khẩn cấp trong đoạn ghi âm.</p>
                  )}
                </section>

                {/* 3. QUYẾT ĐỊNH, ĐỀ XUẤT VÀ VẤN ĐỀ CÒN MỞ */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-3 flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        3
                      </span>
                      Quyết định, đề xuất và vấn đề còn mở
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#EDF2F7] text-[#17324D] text-xs uppercase font-semibold">
                          <th className="py-2.5 px-3 border-b border-slate-300 w-36">Trạng thái</th>
                          <th className="py-2.5 px-3 border-b border-slate-300">Nội dung chi tiết</th>
                          <th className="py-2.5 px-3 border-b border-slate-300 w-1/3">Hàm ý thực thi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {analysis.decisions && analysis.decisions.length > 0 ? (
                          analysis.decisions.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 align-top">
                                <span
                                  className={`inline-block text-xs px-2.5 py-1 rounded font-semibold ${
                                    d.status === 'Đã kết luận'
                                      ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                      : d.status === 'Đang đề xuất'
                                      ? 'bg-slate-200 text-slate-700 border border-slate-300'
                                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                                  }`}
                                >
                                  {d.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-top text-slate-800">{d.content}</td>
                              <td className="py-2.5 px-3 align-top text-slate-600 text-xs leading-relaxed">
                                {d.implication}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="py-3 px-3 text-center text-xs text-slate-500 italic">
                              Chưa ghi nhận quyết định hoặc đề xuất nào trong file âm thanh.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 4. BẢNG GIAO VIỆC VÀ THỜI HẠN */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        4
                      </span>
                      Bảng giao việc và thời hạn
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#EDF2F7] text-[#17324D] text-xs uppercase font-semibold">
                          <th className="py-2.5 px-3 border-b border-slate-300 w-16 text-center">Mã</th>
                          <th className="py-2.5 px-3 border-b border-slate-300">Sản phẩm / Đầu ra</th>
                          <th className="py-2.5 px-3 border-b border-slate-300 w-44">Chịu trách nhiệm</th>
                          <th className="py-2.5 px-3 border-b border-slate-300 w-28 text-center">Thời hạn</th>
                          <th className="py-2.5 px-3 border-b border-slate-300 w-48">Căn cứ giao việc</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {analysis.tasks && analysis.tasks.length > 0 ? (
                          analysis.tasks.map((t, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 align-top font-mono font-bold text-center text-[#17324D]">
                                {t.code}
                              </td>
                              <td className="py-2.5 px-3 align-top font-medium text-slate-900">
                                {t.deliverable}
                              </td>
                              <td className="py-2.5 px-3 align-top text-slate-700">{t.owner}</td>
                              <td className="py-2.5 px-3 align-top font-mono text-xs text-center font-semibold text-slate-800">
                                {t.deadline}
                              </td>
                              <td className="py-2.5 px-3 align-top text-xs text-slate-500">{t.basis}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-3 px-3 text-center text-xs text-slate-500 italic">
                              Không có nhiệm vụ giao việc cụ thể nào được nhắc đến trong băng ghi âm.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 5. RỦI RO, NGUỒN LỰC VÀ TÁC ĐỘNG */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        5
                      </span>
                      Rủi ro, nguồn lực và tác động
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {analysis.risks && analysis.risks.length > 0 ? (
                      analysis.risks.map((r, i) => (
                        <div
                          key={i}
                          className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 text-sm space-y-1.5"
                        >
                          <div className="flex items-center gap-2 font-bold text-red-900">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <span>{r.issue}</span>
                          </div>
                          <div className="text-xs text-slate-700 pl-6">
                            <span className="font-semibold text-slate-900">Tác động:</span> {r.impact}
                          </div>
                          <div className="text-xs text-slate-700 pl-6">
                            <span className="font-semibold text-emerald-800">Phương án giảm thiểu:</span>{' '}
                            {r.mitigation}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic">Chưa ghi nhận rủi ro tiềm ẩn nào.</p>
                    )}
                  </div>
                </section>

                {/* 6. THEO DÕI SAU HỌP */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        6
                      </span>
                      Theo dõi sau họp
                    </h3>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-800">
                    {analysis.follow_up && analysis.follow_up.length > 0 ? (
                      analysis.follow_up.map((act, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{act}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-slate-500 italic">Không có hành động theo dõi riêng biệt.</li>
                    )}
                  </ul>
                </section>

                {/* 7. ĐỊNH HƯỚNG, BẤT ĐỒNG VÀ TÍN HIỆU XU HƯỚNG */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        7
                      </span>
                      Định hướng, bất đồng và tín hiệu xu hướng
                    </h3>
                  </div>
                  <div className="space-y-3.5 text-sm">
                    <div>
                      <h4 className="font-bold text-[#17324D] text-xs uppercase mb-1">
                        7.1. Định hướng đã tuyên bố:
                      </h4>
                      <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-800 italic">
                        "{analysis.direction_signals?.stated || 'Chưa ghi nhận định hướng trong đoạn ghi âm.'}"
                      </p>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#17324D] text-xs uppercase mb-1">
                        7.2. Các quan điểm bất đồng / chưa thống nhất:
                      </h4>
                      <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-800 italic">
                        "{analysis.direction_signals?.disagreements || 'Chưa ghi nhận bất đồng đáng kể trong cuộc họp.'}"
                      </p>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#17324D] text-xs uppercase mb-1">
                        7.3. Các nội dung cần xác minh đối chiếu:
                      </h4>
                      <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-800 italic">
                        "{analysis.direction_signals?.to_verify || 'Cần đối chiếu với quy chế và văn bản chỉ đạo hiện hành.'}"
                      </p>
                    </div>
                  </div>
                </section>

                {/* 8. GÓP Ý THAM MƯU DÀNH CHO HIỆU TRƯỞNG */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-3 flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        8
                      </span>
                      Góp ý tham mưu dành cho Hiệu trưởng
                    </h3>
                    <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-medium">
                      Đề xuất độc lập của hệ thống
                    </span>
                  </div>
                  <ul className="space-y-2.5 text-sm">
                    {analysis.suggestions && analysis.suggestions.length > 0 ? (
                      analysis.suggestions.map((sug, i) => (
                        <li
                          key={i}
                          className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-blue-950 flex items-start gap-2.5"
                        >
                          <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <span>{sug}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-slate-500 italic">Không có đề xuất tham mưu bổ sung.</li>
                    )}
                  </ul>
                </section>

                {/* 9. KIỂM CHỨNG TRƯỚC KHI SỬ DỤNG & CHỮ KÝ */}
                <section className="bg-white rounded-lg border border-slate-300 shadow-sm p-5">
                  <div className="border-b border-slate-200 pb-2.5 mb-4">
                    <h3 className="text-base font-bold text-[#17324D] flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#17324D] text-white text-xs flex items-center justify-center font-bold">
                        9
                      </span>
                      Kiểm chứng trước khi sử dụng
                    </h3>
                  </div>
                  <div className="overflow-x-auto mb-8">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#EDF2F7] text-[#17324D] text-xs uppercase font-semibold">
                          <th className="py-2.5 px-3 border-b border-slate-300 w-1/3">
                            Nội dung cần kiểm chứng
                          </th>
                          <th className="py-2.5 px-3 border-b border-slate-300">
                            Tài liệu / Căn cứ minh chứng
                          </th>
                          <th className="py-2.5 px-3 border-b border-slate-300 w-36 text-center">
                            Trạng thái
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {analysis.verification && analysis.verification.length > 0 ? (
                          analysis.verification.map((v, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 align-top font-medium text-slate-900">
                                {v.item}
                              </td>
                              <td className="py-2.5 px-3 align-top text-slate-700 text-xs">
                                {v.evidence}
                              </td>
                              <td className="py-2.5 px-3 align-top text-center">
                                <span
                                  className={`inline-block text-xs px-2 py-0.5 rounded font-semibold ${
                                    v.status === 'Đã rõ'
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : 'bg-red-100 text-red-900 border border-red-300'
                                  }`}
                                >
                                  {v.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="py-3 px-3 text-center text-xs text-slate-500 italic">
                              Chưa có nội dung cần đối soát.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* BẢNG CHỮ KÝ XÁC NHẬN */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-center pt-6 border-t border-slate-200">
                    <div className="space-y-1">
                      <p className="font-bold text-[#17324D] text-sm uppercase">
                        NGƯỜI RÀ SOÁT NỘI DUNG
                      </p>
                      <p className="text-xs text-slate-500 italic">(Ký và ghi rõ họ tên)</p>
                      <div className="h-16 flex items-center justify-center">
                        <span className="font-serif italic text-slate-400">[Đã rà soát điện tử]</span>
                      </div>
                      <p className="font-bold text-slate-800 text-sm">{metadata.reviewer}</p>
                      <p className="text-xs text-slate-500">Ngày: {metadata.review_date}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="font-bold text-[#17324D] text-sm uppercase">
                        HIỆU TRƯỞNG / NGƯỜI ĐƯỢC GIAO XÁC NHẬN
                      </p>
                      <p className="text-xs text-slate-500 italic">
                        (Ký, phê duyệt và ban hành thông báo kết luận)
                      </p>
                      <div className="h-16 flex items-center justify-center">
                        <span className="font-serif italic text-slate-400">
                          [Chờ phê duyệt chính thức]
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 text-sm">{metadata.chair}</p>
                      <p className="text-xs text-slate-500">Ngày: ........ / ........ / 2026</p>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {/* TAB 4: MÃ XELATEX & BIÊN DỊCH */}
        {activeTab === 'latex' && (
          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-[#17324D] flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-amber-500" />
                  Mã nguồn XeLaTeX (report.tex)
                </h3>
                <p className="text-xs text-slate-500">
                  Định dạng XeLaTeX UTF-8 • Font Times New Roman • Sinh từ kết quả âm thanh thật.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyTex}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedTex ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Đã sao chép!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Sao chép mã LaTeX
                    </>
                  )}
                </button>

                <button
                  onClick={() =>
                    downloadFile(latexSource, `${metadata.meeting_id}_report.tex`, 'text/plain')
                  }
                  className="px-3.5 py-1.5 bg-[#17324D] hover:bg-[#1f4265] text-white text-xs font-semibold rounded shadow transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải về report.tex
                </button>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-[600px] border border-slate-800 shadow-inner">
              <pre className="whitespace-pre">{latexSource}</pre>
            </div>
          </div>
        )}

        {/* TAB 5: KIẾN TRÚC PYTHON & CLI */}
        {activeTab === 'cli' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="bg-white rounded-lg border border-slate-300 shadow-sm p-6 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-lg font-bold text-[#17324D] flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-amber-500" />
                  Chạy với file ghi âm thật trên CLI
                </h3>
                <p className="text-xs text-slate-500">
                  Dòng lệnh dành cho Thư ký / Kỹ thuật viên vận hành trực tiếp trên máy chủ hoặc máy tính cá nhân.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-sm text-[#17324D]">Lệnh chạy với file âm thanh thực:</h4>
                <div className="space-y-2">
                  <div className="bg-slate-900 text-slate-100 p-3 rounded font-mono text-xs flex items-center justify-between">
                    <code>
                      python -m meeting_assistant run --input duong_dan_file_ghi_am_that.wav --meta meta.json --out output/
                    </code>
                    <span className="text-[11px] text-amber-400 font-sans">Pipeline toàn trình</span>
                  </div>

                  <div className="bg-slate-900 text-slate-100 p-3 rounded font-mono text-xs flex items-center justify-between">
                    <code>python -m meeting_assistant record --duration 3600 --out cuoc_hop_that.wav</code>
                    <span className="text-[11px] text-amber-400 font-sans">Thu âm thực tế 1h</span>
                  </div>

                  <div className="bg-slate-900 text-slate-100 p-3 rounded font-mono text-xs flex items-center justify-between">
                    <code>python -m meeting_assistant compile --tex output/report.tex --clean</code>
                    <span className="text-[11px] text-amber-400 font-sans">Biên dịch XeLaTeX</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL CẤU HÌNH API KEY (DEEPSEEK, GROK, OPENAI) */}
      {showKeyConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-300 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#17324D] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">Cấu hình Khóa API cho các Mô hình AI</h3>
              </div>
              <button
                onClick={() => setShowKeyConfigModal(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  Nhập khóa API của các mô hình trực tiếp dưới đây. Khóa sẽ được gửi tới máy chủ backend và lưu vào phiên làm việc bảo mật để phục vụ phân tích cuộc họp.
                </div>
              </div>

              {/* Thông báo kết quả lưu key */}
              {saveKeyMessage && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
                    saveKeyMessage.success
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-red-50 text-red-900 border-red-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {saveKeyMessage.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{saveKeyMessage.text}</span>
                  </div>
                  <button
                    onClick={() => setSaveKeyMessage(null)}
                    className="text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* CÁC Ô NHẬP KEY TRỰC TIẾP TRÊN GIAO DIỆN */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Nhập khóa API cho từng mô hình:
                </h4>

                {/* 1. DeepSeek */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">🟣 DeepSeek API</span>
                      <span className="text-[11px] text-slate-500 font-mono">(DEEPSEEK_API_KEY)</span>
                    </div>
                    {providers.find((p) => p.id === 'deepseek')?.configured ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã kích hoạt
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                        Chưa có key
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Sử dụng cho mô hình <strong>deepseek-chat</strong> (V3) và <strong>deepseek-reasoner</strong> (R1) lập luận tham mưu.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <input
                        type={showKeyVisible.deepseek ? 'text' : 'password'}
                        value={keyInputs.deepseek}
                        onChange={(e) =>
                          setKeyInputs({ ...keyInputs, deepseek: e.target.value })
                        }
                        placeholder="Dán khóa sk-..."
                        className="w-full pl-3 pr-9 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#17324D]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKeyVisible({
                            ...showKeyVisible,
                            deepseek: !showKeyVisible.deepseek,
                          })
                        }
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showKeyVisible.deepseek ? 'Ẩn' : 'Hiện'}
                      >
                        {showKeyVisible.deepseek ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey('deepseek')}
                      disabled={savingKey === 'deepseek'}
                      className="px-3 py-1.5 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      {savingKey === 'deepseek' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Lưu Key
                    </button>
                  </div>
                </div>

                {/* 2. xAI Grok */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">⚫ xAI Grok API</span>
                      <span className="text-[11px] text-slate-500 font-mono">(GROK_API_KEY)</span>
                    </div>
                    {providers.find((p) => p.id === 'grok')?.configured ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã kích hoạt
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                        Chưa có key
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Sử dụng cho mô hình <strong>grok-2-latest</strong> của xAI đánh giá rủi ro và hàm ý thực thi.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <input
                        type={showKeyVisible.grok ? 'text' : 'password'}
                        value={keyInputs.grok}
                        onChange={(e) =>
                          setKeyInputs({ ...keyInputs, grok: e.target.value })
                        }
                        placeholder="Dán khóa xai-..."
                        className="w-full pl-3 pr-9 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#17324D]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKeyVisible({
                            ...showKeyVisible,
                            grok: !showKeyVisible.grok,
                          })
                        }
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showKeyVisible.grok ? 'Ẩn' : 'Hiện'}
                      >
                        {showKeyVisible.grok ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey('grok')}
                      disabled={savingKey === 'grok'}
                      className="px-3 py-1.5 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      {savingKey === 'grok' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Lưu Key
                    </button>
                  </div>
                </div>

                {/* 3. OpenAI */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">🟢 OpenAI API</span>
                      <span className="text-[11px] text-slate-500 font-mono">(OPENAI_API_KEY)</span>
                    </div>
                    {providers.find((p) => p.id === 'openai')?.configured ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã kích hoạt
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                        Chưa có key
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Sử dụng cho <strong>Whisper ASR</strong> và <strong>GPT-4o</strong> / <strong>gpt-4o-mini</strong>.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <input
                        type={showKeyVisible.openai ? 'text' : 'password'}
                        value={keyInputs.openai}
                        onChange={(e) =>
                          setKeyInputs({ ...keyInputs, openai: e.target.value })
                        }
                        placeholder="Dán khóa sk-proj-..."
                        className="w-full pl-3 pr-9 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#17324D]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKeyVisible({
                            ...showKeyVisible,
                            openai: !showKeyVisible.openai,
                          })
                        }
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showKeyVisible.openai ? 'Ẩn' : 'Hiện'}
                      >
                        {showKeyVisible.openai ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey('openai')}
                      disabled={savingKey === 'openai'}
                      className="px-3 py-1.5 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      {savingKey === 'openai' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Lưu Key
                    </button>
                  </div>
                </div>

                {/* 4. Google Gemini */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">🔵 Google Gemini</span>
                      <span className="text-[11px] text-slate-500 font-mono">(GEMINI_API_KEY)</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã sẵn sàng
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Khóa Google Gemini đã được hệ thống cấu hình sẵn trên máy chủ, sẵn sàng phục vụ mà không cần cấu hình thêm.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center">
              <button
                onClick={() => {
                  fetch('/api/providers')
                    .then((r) => r.json())
                    .then((d) => {
                      if (d.providers) setProviders(d.providers);
                    });
                }}
                className="text-xs text-blue-700 hover:text-blue-900 font-semibold cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Kiểm tra lại kết nối key
              </button>
              <button
                onClick={() => setShowKeyConfigModal(false)}
                className="px-4 py-2 bg-[#17324D] hover:bg-[#1f4265] text-white rounded text-xs font-semibold transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Hệ thống Meeting Intelligence • Phục vụ công tác điều hành của Hiệu trưởng • Phân tích file ghi âm thực tế
      </footer>
    </div>
  );
}
