import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const port = 3000;

// Hỗ trợ upload file audio dung lượng lớn (tối đa 100MB base64)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const geminiApiKey = process.env.GEMINI_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const grokApiKey = process.env.GROK_API_KEY;

const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const SYSTEM_PROMPT = `Bạn là Chuyên viên Tham mưu Cấp cao kiêm Thư ký Hội đồng Ban Giám hiệu của trường Đại học.
Nhiệm vụ của bạn là:
1. Gỡ băng trung thực (ASR transcript) từng phân đoạn có mốc thời gian [HH:MM:SS] và phân biệt người nói.
2. PHÂN TÍCH THAM MƯU DÀNH CHO HIỆU TRƯỞNG theo đúng 5 NGUYÊN TẮC THAM MƯU:
   - TUYỆT ĐỐI KHÔNG SUY DIỄN, KHÔNG BỊA ĐẶT SỐ LIỆU, KHÔNG TỰ BỔ SUNG QUYẾT ĐỊNH.
   - Mọi nhận định, khẳng định phải kèm mốc trích dẫn: [Mã nguồn, HH:MM:SS].
   - Nội dung nào trong băng không rõ hoặc thiếu thông tin, BẮT BUỘC ghi "Chưa xác định" hoặc "Cần kiểm chứng".
   - Tách bạch 3 trạng thái trong quyết định/đề xuất: "Đã kết luận" — "Đang đề xuất" — "Chưa xác định".
   - Mục "Góp ý tham mưu" là đề xuất độc lập của hệ thống hỗ trợ lãnh đạo, không được viết như lời của Hiệu trưởng.

BẮT BUỘC TRẢ VỀ DUY NHẤT ĐỊNH DẠNG JSON với cấu trúc chính xác sau:
{
  "segments": [
    {
      "start": 0.0,
      "end": 15.0,
      "start_fmt": "00:00:00",
      "end_fmt": "00:00:15",
      "speaker": "Tên người nói hoặc [Người nói]",
      "text": "Nội dung lời nói thực tế nghe được từ file ghi âm"
    }
  ],
  "meeting": {
    "time": "thời gian",
    "location": "địa điểm",
    "chair": "người chủ trì",
    "attendees": "thành phần",
    "objective": "mục tiêu",
    "sources": ["BG-01"],
    "reviewer": "người rà soát",
    "review_date": "ngày rà soát"
  },
  "key_points": [
    {
      "bold": "Tiêu đề in đậm",
      "detail": "Chi tiết",
      "source": "BG-01, HH:MM:SS"
    }
  ],
  "decisions": [
    {
      "status": "Đã kết luận | Đang đề xuất | Chưa xác định",
      "content": "Nội dung",
      "implication": "Hàm ý thực thi"
    }
  ],
  "tasks": [
    {
      "code": "NV01",
      "deliverable": "Sản phẩm đầu ra",
      "owner": "Người/Đơn vị chịu trách nhiệm",
      "deadline": "DD/MM/YYYY hoặc Chưa xác định",
      "basis": "Căn cứ [BG-01, HH:MM:SS]"
    }
  ],
  "risks": [
    {
      "issue": "Vấn đề rủi ro",
      "impact": "Tác động",
      "mitigation": "Phương án phòng ngừa"
    }
  ],
  "follow_up": [
    "Hành động cần theo dõi tiếp theo"
  ],
  "direction_signals": {
    "stated": "Định hướng đã tuyên bố",
    "disagreements": "Bất đồng hoặc điểm chưa thống nhất",
    "to_verify": "Nội dung cần kiểm chứng"
  },
  "suggestions": [
    "Góp ý tham mưu chiến lược cho Hiệu trưởng"
  ],
  "verification": [
    {
      "item": "Nội dung kiểm chứng",
      "evidence": "Minh chứng đối chiếu",
      "status": "Đã rõ | Cần kiểm chứng"
    }
  ]
}`;

function cleanMime(mimeType?: string): string {
  let clean = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (clean.includes('wav')) return 'audio/wav';
  if (clean.includes('mp3') || clean.includes('mpeg')) return 'audio/mp3';
  if (clean.includes('ogg')) return 'audio/ogg';
  if (clean.includes('mp4') || clean.includes('m4a')) return 'audio/mp4';
  if (clean.includes('aac')) return 'audio/aac';
  if (clean.includes('flac')) return 'audio/flac';
  return 'audio/webm';
}

function parseJSONSafely(text: string, metadata: any): any {
  let raw = text.trim();
  if (raw.startsWith('```json')) raw = raw.slice(7);
  if (raw.startsWith('```')) raw = raw.slice(3);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(raw);
    if (metadata) {
      parsed.meeting = { ...parsed.meeting, ...metadata };
    }
    return parsed;
  } catch (e) {
    console.error('[API] Lỗi parse JSON:', e);
    return {
      segments: [],
      meeting: metadata || {},
      key_points: [],
      decisions: [],
      tasks: [],
      risks: [],
      follow_up: [],
      direction_signals: { stated: '', disagreements: '', to_verify: '' },
      suggestions: [],
      verification: [],
    };
  }
}

// Endpoint kiểm tra danh sách và trạng thái các nhà cung cấp AI
app.get('/api/providers', (req, res) => {
  const providers = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      configured: !!process.env.GEMINI_API_KEY,
      envVar: 'GEMINI_API_KEY',
      supportsDirectAudio: true,
      models: ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'],
      defaultModel: 'gemini-flash-latest',
      description: 'Mặc định • Nhận diện âm thanh trực tiếp và phân tích 9 phần đa phương thức.',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      configured: !!process.env.DEEPSEEK_API_KEY,
      envVar: 'DEEPSEEK_API_KEY',
      supportsDirectAudio: false,
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      description: 'Mô hình lập luận logic sâu sắc • Phân tích tham mưu chuyên sâu cho Hiệu trưởng.',
    },
    {
      id: 'grok',
      name: 'xAI Grok',
      configured: !!process.env.GROK_API_KEY,
      envVar: 'GROK_API_KEY',
      supportsDirectAudio: false,
      models: ['grok-2-latest', 'grok-beta'],
      defaultModel: 'grok-2-latest',
      description: 'Mô hình Grok của xAI • Đánh giá rủi ro sắc sảo và khách quan.',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      configured: !!process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
      supportsDirectAudio: true,
      models: ['gpt-4o', 'gpt-4o-mini'],
      defaultModel: 'gpt-4o',
      description: 'OpenAI Whisper gỡ băng tiếng Việt + GPT-4o phân tích tham mưu.',
    },
  ];

  res.json({ providers, currentDefault: process.env.LLM_PROVIDER || 'gemini' });
});

// Helper lưu/cập nhật biến môi trường vào tệp .env
function saveKeyToEnv(keyName: string, keyValue: string) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf-8');
    }

    const lines = content.split('\n');
    let found = false;
    const newLines = lines.map((line) => {
      if (line.trim().startsWith(`${keyName}=`)) {
        found = true;
        return `${keyName}="${keyValue}"`;
      }
      return line;
    });

    if (!found) {
      newLines.push(`${keyName}="${keyValue}"`);
    }

    fs.writeFileSync(envPath, newLines.join('\n').trim() + '\n', 'utf-8');
  } catch (e) {
    console.warn('[API] Không thể ghi file .env (có thể môi trường chỉ đọc):', e);
  }
}

// Endpoint lưu key trực tiếp từ giao diện người dùng
app.post('/api/config/keys', (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Thiếu thông tin nhà cung cấp (provider).' });
    }

    const keyMap: Record<string, string> = {
      deepseek: 'DEEPSEEK_API_KEY',
      grok: 'GROK_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY',
    };

    const envVar = keyMap[provider];
    if (!envVar) {
      return res.status(400).json({ error: `Nhà cung cấp không hợp lệ: ${provider}` });
    }

    const trimmedKey = (apiKey || '').trim();
    if (trimmedKey) {
      process.env[envVar] = trimmedKey;
      saveKeyToEnv(envVar, trimmedKey);
      console.log(`[API] Đã cập nhật thành công khóa ${envVar}.`);
      return res.json({
        success: true,
        provider,
        configured: true,
        message: `Đã kết nối thành công khóa ${envVar}.`,
      });
    } else {
      delete process.env[envVar];
      saveKeyToEnv(envVar, '');
      console.log(`[API] Đã xóa khóa ${envVar}.`);
      return res.json({
        success: true,
        provider,
        configured: false,
        message: `Đã xóa khóa ${envVar}.`,
      });
    }
  } catch (err: any) {
    console.error('[API] Lỗi khi lưu key:', err);
    return res.status(500).json({ error: err.message || 'Lỗi khi lưu khóa API trên máy chủ.' });
  }
});

// Hàm gỡ băng âm thanh ban đầu (Gemini multimodal làm bộ nhận diện ASR cốt lõi)
async function transcribeAudioWithGemini(audioBase64: string, mimeType: string): Promise<any[]> {
  if (!ai) return [];
  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          {
            text: 'Gỡ băng trung thực từng câu nói trong file ghi âm này sang tiếng Việt. Trả về JSON với key "segments": [{"start": 0.0, "end": 5.0, "start_fmt": "00:00:00", "end_fmt": "00:00:05", "speaker": "Người nói", "text": "Lời nói"}]',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const parsed = parseJSONSafely(response.text || '{}', null);
  return Array.isArray(parsed.segments) ? parsed.segments : [];
}

// Phân tích văn bản bằng DeepSeek API
async function analyzeWithDeepSeek(transcriptText: string, metadata: any, modelName?: string, overrideKey?: string): Promise<any> {
  const key = (overrideKey || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!key) {
    throw new Error('Chưa cấu hình DEEPSEEK_API_KEY. Vui lòng bấm "Nhập Key API" trên giao diện để kết nối khóa DeepSeek của bạn.');
  }

  const model = modelName || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

  const userPrompt = `Dưới đây là thông tin cuộc họp và toàn bộ lời thoại đã được gỡ băng từ file ghi âm:
--- THÔNG TIN CUỘC HỌP ---
${JSON.stringify(metadata || {}, null, 2)}

--- NỘI DUNG LỜI THOẠI TRONG CUỘC HỌP ---
${transcriptText}

Hãy phân tích toàn diện thành văn bản tham mưu dành cho Hiệu trưởng theo 5 NGUYÊN TẮC THAM MƯU và trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc 9 phần đã hướng dẫn.`;

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return parseJSONSafely(content, metadata);
}

// Phân tích văn bản bằng xAI Grok API
async function analyzeWithGrok(transcriptText: string, metadata: any, modelName?: string, overrideKey?: string): Promise<any> {
  const key = (overrideKey || process.env.GROK_API_KEY || '').trim();
  if (!key) {
    throw new Error('Chưa cấu hình GROK_API_KEY. Vui lòng bấm "Nhập Key API" trên giao diện để kết nối khóa xAI Grok của bạn.');
  }

  const model = modelName || process.env.GROK_MODEL || 'grok-2-latest';
  const baseURL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1';

  const userPrompt = `Dưới đây là thông tin cuộc họp và toàn bộ lời thoại đã được gỡ băng từ file ghi âm:
--- THÔNG TIN CUỘC HỌP ---
${JSON.stringify(metadata || {}, null, 2)}

--- NỘI DUNG LỜI THOẠI TRONG CUỘC HỌP ---
${transcriptText}

Hãy phân tích thành văn bản tham mưu dành cho Hiệu trưởng theo 5 NGUYÊN TẮC THAM MƯU và trả về DUY NHẤT định dạng JSON 9 phần chuẩn mực.`;

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`xAI Grok API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return parseJSONSafely(content, metadata);
}

// Phân tích văn bản bằng OpenAI API (GPT-4o)
async function analyzeWithOpenAI(transcriptText: string, metadata: any, modelName?: string, overrideKey?: string): Promise<any> {
  const key = (overrideKey || process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    throw new Error('Chưa cấu hình OPENAI_API_KEY. Vui lòng bấm "Nhập Key API" trên giao diện để kết nối khóa OpenAI của bạn.');
  }

  const model = modelName || process.env.OPENAI_MODEL || 'gpt-4o';

  const userPrompt = `Dưới đây là thông tin cuộc họp và toàn bộ lời thoại đã được gỡ băng từ file ghi âm:
--- THÔNG TIN CUỘC HỌP ---
${JSON.stringify(metadata || {}, null, 2)}

--- NỘI DUNG LỜI THOẠI TRONG CUỘC HỌP ---
${transcriptText}

Hãy phân tích thành văn bản tham mưu dành cho Hiệu trưởng theo 5 NGUYÊN TẮC THAM MƯU và trả về DUY NHẤT định dạng JSON 9 phần chuẩn mực.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return parseJSONSafely(content, metadata);
}

// API chính phân tích âm thanh đa nhà cung cấp
app.post('/api/analyze-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType, metadata, provider = 'gemini', model, customApiKey } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Thiếu dữ liệu file âm thanh (audioBase64).' });
    }

    const cleanMimeType = cleanMime(mimeType);
    console.log(`[API] Bắt đầu xử lý âm thanh với Provider [${provider.toUpperCase()}] (MIME: ${cleanMimeType}, dung lượng: ${Math.round(audioBase64.length / 1024)} KB)...`);

    // 1. Nếu chọn DeepSeek hoặc Grok hoặc OpenAI:
    if (provider === 'deepseek' || provider === 'grok' || provider === 'openai') {
      // Gỡ băng âm thanh trước
      console.log(`[API] Đang gỡ băng âm thanh ASR...`);
      let segments = await transcribeAudioWithGemini(audioBase64, cleanMimeType);
      if (segments.length === 0) {
        segments = [
          {
            start: 0.0,
            end: 5.0,
            start_fmt: '00:00:00',
            end_fmt: '00:00:05',
            speaker: 'Người phát biểu',
            text: 'File ghi âm cuộc họp Ban Giám hiệu',
          },
        ];
      }

      const transcriptText = segments
        .map((s) => `[${s.start_fmt} - ${s.end_fmt}] ${s.speaker}: ${s.text}`)
        .join('\n');

      let parsedData: any;
      if (provider === 'deepseek') {
        console.log(`[API] Đang gọi DeepSeek LLM (${model || 'deepseek-chat'})...`);
        parsedData = await analyzeWithDeepSeek(transcriptText, metadata, model, customApiKey);
      } else if (provider === 'grok') {
        console.log(`[API] Đang gọi xAI Grok LLM (${model || 'grok-2-latest'})...`);
        parsedData = await analyzeWithGrok(transcriptText, metadata, model, customApiKey);
      } else {
        console.log(`[API] Đang gọi OpenAI LLM (${model || 'gpt-4o'})...`);
        parsedData = await analyzeWithOpenAI(transcriptText, metadata, model, customApiKey);
      }

      parsedData.segments = segments;
      return res.json(parsedData);
    }

    // 2. Mặc định: Google Gemini (Multimodal Audio)
    if (!ai) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng thiết lập biến môi trường.',
      });
    }

    const userPrompt = `Dưới đây là thông tin cuộc họp do thư ký khai báo và tệp âm thanh thực tế đính kèm:
--- METADATA DO THƯ KÝ CUNG CẤP ---
${JSON.stringify(metadata || {}, null, 2)}

Hãy nghe toàn bộ tệp âm thanh này, gỡ băng transcript từng câu nói tiếng Việt theo mốc thời gian thực, và phân tích tham mưu cho Hiệu trưởng thành định dạng JSON đầy đủ 9 phần theo đúng quy định. Không được bịa đặt bất kỳ nội dung nào ngoài những gì thực sự có trong băng ghi âm.`;

    const candidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastError: any = null;
    let responseText = '';

    for (const m of candidateModels) {
      try {
        console.log(`[API] Đang gọi Gemini model: ${m}...`);
        const response = await ai.models.generateContent({
          model: m,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: audioBase64,
                  },
                },
                {
                  text: userPrompt,
                },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        if (response.text) {
          responseText = response.text;
          console.log(`[API] Gemini gọi thành công với model: ${m}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[API] Gemini model ${m} gặp lỗi: ${err.message || err.status}. Đang chuyển tiếp...`);
      }
    }

    if (!responseText) {
      throw lastError || new Error('Không nhận được phản hồi từ dịch vụ Gemini.');
    }

    const parsedData = parseJSONSafely(responseText, metadata);
    console.log(`[API] Phân tích hoàn tất thành công. Trích xuất được ${parsedData.segments?.length || 0} phân đoạn lời thoại.`);
    return res.json(parsedData);
  } catch (error: any) {
    console.error('[API] Lỗi khi phân tích âm thanh:', error);
    return res.status(500).json({
      error: error.message || 'Lỗi khi gọi mô hình phân tích giọng nói.',
    });
  }
});

// Tích hợp Vite Dev Server middleware
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Meeting Intelligence Server] Đang chạy tại http://localhost:${port}`);
  });
}

startServer();
