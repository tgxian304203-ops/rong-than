// server/boss/phan-tich-yeu-cau.js
// Nhiệm vụ: BOSS phân tích yêu cầu User — 3 TẦNG.
// Chọn model theo độ dài: Groq (<20k) / Gemini (20k-100k) / Chunk (>100k).

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { LIMITS } from "../config/limits.js";
import { countTokens, countMessagesTokens, pickStrategy } from "../utils/token-counter.js";
import { chunkText } from "../utils/chunker.js";
import { compressContext } from "../utils/context-compressor.js";
import { layDanhSachUngVien, DAI_NAO_TASK, doTatCaModelDong } from "../dai-nao/danh-sach-ung-vien.js";
import { locUngVien } from "../dai-nao/loc-ung-vien.js";
import { listKeysByProvider } from "../db/daiNaoKeys.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// ENTRY POINT
// ============================================================

export async function phanTichYeuCau({
  userId,
  conversationId,
  userRequest,
  userLabel = null,
  history = [],
  signal,
}) {
  const req = String(userRequest || "").trim();
  if (!req) return { ok: false, analysis: null, error: "Yêu cầu rỗng" };

  const startTime = Date.now();

  // ===== ĐO TOKEN YÊU CẦU =====
  const reqTokens = countTokens(req);
  const strategy = pickStrategy(reqTokens);

  // ===== NÉN NGỮ CẢNH =====
  const compressed = compressContext({
    history,
    userRequest: req,
    taskType: null,
    maxTokens: LIMITS.CONTEXT_TOKEN_GEMINI_MAX,
  });

  const compressedTokens = compressed.groups.length > 0
    ? countMessagesTokens(compressed.groups.flat())
    : countMessagesTokens(compressed.messages);

  const totalTokens = reqTokens + compressedTokens;

  await logInfo("BOSS: === BẮT ĐẦU PHÂN TÍCH 3 TẦNG ===", {
    userId,
    conversationId,
    reqTokens,
    compressedTokens,
    totalTokens,
    strategy,
  });

  // ============================================================
  // NẾU YÊU CẦU > 100k tokens → CHIA NHỎ
  // ============================================================
  if (reqTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) {
    await logWarn("BOSS: yêu cầu quá dài — chia nhỏ", {
      userId,
      reqTokens,
      maxAllowed: LIMITS.CONTEXT_TOKEN_GEMINI_MAX,
    });

    return await analyzeChunked({
      userId,
      conversationId,
      req,
      history,
      userLabel,
      signal,
      compressed,
    });
  }

  // ============================================================
  // TẦNG 1 — BASIC ANALYSIS
  // ============================================================
  const t1Start = Date.now();
  const basic = await analyzeBasic({
    userId,
    req,
    history: compressed.messages.length > 0 ? compressed.messages : history,
    strategy,
    signal,
  });
  const t1Duration = Date.now() - t1Start;

  await logInfo("BOSS: Tầng 1 hoàn thành", {
    userId,
    durationMs: t1Duration,
    taskType: basic.taskType,
    usedFallback: basic.usedFallback,
    model: basic.model,
    strategy,
  });

  // TẦNG 2
  const t2Start = Date.now();
  const deep = await analyzeDeep({ userId, req, basic, signal });
  const t2Duration = Date.now() - t2Start;

  await logInfo("BOSS: Tầng 2 hoàn thành", {
    userId,
    durationMs: t2Duration,
    subtaskCount: deep.subtasks?.length || 0,
    usedFallback: deep.usedFallback,
    model: deep.model,
  });

  // TẦNG 3
  const t3Start = Date.now();
  const crossCheck = await analyzeCrossCheck({ userId, req, basic, deep, signal });
  const t3Duration = Date.now() - t3Start;

  await logInfo("BOSS: Tầng 3 hoàn thành", {
    userId,
    durationMs: t3Duration,
    matchesUserIntent: crossCheck.matchesUserIntent,
    missingCount: crossCheck.missingRequirements?.length || 0,
    usedFallback: crossCheck.usedFallback,
    model: crossCheck.model,
  });

  const totalDuration = Date.now() - startTime;

  const analysis = {
    taskType: basic.taskType,
    goal: basic.goal,
    requirements: basic.requirements || [],
    constraints: basic.constraints || [],
    expectedOutput: basic.expectedOutput || "",
    length: basic.length || "",
    tone: basic.tone || "",
    targetAudience: basic.targetAudience || "",
    language: basic.language || "vi",
    subtasks: deep.subtasks || [],
    risks: deep.risks || [],
    alternativeApproaches: deep.alternativeApproaches || [],
    qualityCriteria: deep.qualityCriteria || [],
    matchesUserIntent: crossCheck.matchesUserIntent !== false,
    missingRequirements: crossCheck.missingRequirements || [],
    suggestions: crossCheck.suggestions || [],
    needWeb: userLabel === "need_web" || detectNeedWeb(req),
    needCode: userLabel === "need_code" || basic.taskType === "code",
    isRedo: basic.isRedo,
    inheritedTaskType: basic.inheritedTaskType,
    rawLength: req.length,
    totalDuration,
    strategy,
  };

  await logInfo("BOSS: === KẾT THÚC PHÂN TÍCH 3 TẦNG ===", {
    userId,
    totalDurationMs: totalDuration,
    taskType: analysis.taskType,
    strategy,
  });

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.CLASSIFIED,
    WORK_STATUS.IN_PROGRESS
  );

  return { ok: true, analysis };
}

// ============================================================
// CHUNKED — YÊU CẦU QUÁ DÀI
// ============================================================

async function analyzeChunked({
  userId,
  conversationId,
  req,
  history,
  userLabel,
  signal,
  compressed,
}) {
  const chunks = chunkText(req);
  const results = [];

  await logInfo("BOSS: chia yêu cầu thành nhiều phần", {
    userId,
    chunkCount: chunks.length,
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkReq = `[PHẦN ${i + 1}/${chunks.length} của yêu cầu dài]\n${chunk}`;

    const t1 = await analyzeBasic({
      userId,
      req: chunkReq,
      history: i === 0 ? (compressed.messages.length > 0 ? compressed.messages : history) : [],
      strategy: "gemini",
      signal,
    });

    results.push(t1);

    await logInfo(`BOSS: phân tích phần ${i + 1}/${chunks.length} xong`, {
      userId,
      taskType: t1.taskType,
      model: t1.model,
    });
  }

  // Ghép kết quả nối tiếp
  const combinedBasic = {
    taskType: results[0]?.taskType || "bulk",
    goal: results.map((r, i) => `[Phần ${i + 1}] ${r.goal}`).join("\n\n"),
    requirements: results.flatMap((r) => r.requirements || []),
    constraints: results.flatMap((r) => r.constraints || []),
    expectedOutput: results.map((r) => r.expectedOutput).filter(Boolean).join("\n"),
    length: results[0]?.length || "",
    tone: results[0]?.tone || "",
    targetAudience: results[0]?.targetAudience || "",
    language: "vi",
    isRedo: false,
    inheritedTaskType: null,
    model: results[0]?.model || null,
    usedFallback: false,
  };

  const analysis = {
    taskType: combinedBasic.taskType,
    goal: combinedBasic.goal,
    requirements: combinedBasic.requirements,
    constraints: combinedBasic.constraints,
    expectedOutput: combinedBasic.expectedOutput,
    length: combinedBasic.length,
    tone: combinedBasic.tone,
    targetAudience: combinedBasic.targetAudience,
    language: "vi",
    subtasks: [],
    risks: [],
    alternativeApproaches: [],
    qualityCriteria: [],
    matchesUserIntent: true,
    missingRequirements: [],
    suggestions: [],
    needWeb: userLabel === "need_web" || detectNeedWeb(req),
    needCode: userLabel === "need_code" || combinedBasic.taskType === "code",
    isRedo: false,
    inheritedTaskType: null,
    rawLength: req.length,
    totalDuration: 0,
    strategy: "chunk",
    chunkCount: chunks.length,
  };

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.CLASSIFIED,
    WORK_STATUS.IN_PROGRESS
  );

  return { ok: true, analysis };
}

// ============================================================
// TẦNG 1 — BASIC
// ============================================================

async function analyzeBasic({ userId, req, history, strategy = "groq", signal }) {
  const prompt = buildBasicPrompt(req, history);

  const result = await callAnalysisModel({
    userId,
    tier: "basic",
    strategy,
    prompt,
    maxTokens: 1024,
    signal,
  });

  if (result.ok && result.parsed) {
    return {
      taskType: normalizeTaskType(result.parsed.taskType, req),
      goal: result.parsed.goal || req,
      requirements: toArray(result.parsed.requirements),
      constraints: toArray(result.parsed.constraints),
      expectedOutput: result.parsed.expectedOutput || "",
      length: result.parsed.length || "",
      tone: result.parsed.tone || "",
      targetAudience: result.parsed.targetAudience || "",
      language: result.parsed.language || "vi",
      isRedo: !!result.parsed.isRedo || detectRedo(req),
      inheritedTaskType: result.parsed.inheritedTaskType || null,
      model: result.model,
      usedFallback: false,
    };
  }

  await logWarn("BOSS: Tầng 1 dùng regex fallback", {
    userId,
    error: result.error,
  });

  return {
    taskType: guessTaskTypeRegex(req),
    goal: req,
    requirements: [],
    constraints: [],
    expectedOutput: "",
    length: extractLengthRegex(req),
    tone: "",
    targetAudience: "",
    language: "vi",
    isRedo: detectRedo(req),
    inheritedTaskType: null,
    model: null,
    usedFallback: true,
  };
}

function buildBasicPrompt(req, history) {
  const historyText = (history || [])
    .slice(-10)
    .map((m) => `[${m.role === "ai" ? "AI" : "User"}]: ${m.text}`)
    .join("\n");

  const lines = [
    "Bạn là bộ phân tích yêu cầu chuyên sâu.",
    "Đọc yêu cầu người dùng và TRẢ VỀ DUY NHẤT 1 JSON (không thêm gì khác).",
    "",
    "Format JSON:",
    "{",
    '  "taskType": "code|bulk|fix|summary|research|analysis|read-long-doc",',
    '  "goal": "mô tả mục tiêu cụ thể",',
    '  "requirements": ["yêu cầu 1", "yêu cầu 2"],',
    '  "constraints": ["ràng buộc 1"],',
    '  "expectedOutput": "mô tả kết quả mong đợi",',
    '  "length": "số chữ/ký tự nếu có",',
    '  "tone": "phong cách",',
    '  "targetAudience": "đối tượng",',
    '  "language": "vi",',
    '  "isRedo": false,',
    '  "inheritedTaskType": null',
    "}",
    "",
    "Quy tắc:",
    '- Có từ "tạo" → taskType = "code"',
    '- Có từ "viết" → taskType = "bulk"',
    '- Nếu là "làm lại", "chưa đủ", "sửa lại" → isRedo = true',
    "",
  ];

  if (historyText) {
    lines.push("Lịch sử gần đây:");
    lines.push(historyText);
    lines.push("");
  }

  lines.push("Yêu cầu hiện tại:");
  lines.push(req);

  return [
    {
      role: "system",
      content: "Bạn là bộ phân tích. CHỈ trả về JSON. Không thêm text.",
    },
    { role: "user", content: lines.join("\n") },
  ];
}

// ============================================================
// TẦNG 2 — DEEP
// ============================================================

async function analyzeDeep({ userId, req, basic, signal }) {
  const prompt = buildDeepPrompt(req, basic);

  const result = await callAnalysisModel({
    userId,
    tier: "deep",
    strategy: "gemini",
    prompt,
    maxTokens: 2048,
    signal,
  });

  if (result.ok && result.parsed) {
    return {
      subtasks: toArray(result.parsed.subtasks),
      risks: toArray(result.parsed.risks),
      alternativeApproaches: toArray(result.parsed.alternativeApproaches),
      qualityCriteria: toArray(result.parsed.qualityCriteria),
      model: result.model,
      usedFallback: false,
    };
  }

  await logWarn("BOSS: Tầng 2 bỏ qua (không có model)", {
    userId,
    error: result.error,
  });

  return {
    subtasks: [],
    risks: [],
    alternativeApproaches: [],
    qualityCriteria: [],
    model: null,
    usedFallback: true,
  };
}

function buildDeepPrompt(req, basic) {
  return [
    {
      role: "system",
      content: "Bạn là chuyên gia phân tích nhiệm vụ. CHỈ trả về JSON.",
    },
    {
      role: "user",
      content: [
        "Yêu cầu gốc:",
        req,
        "",
        "Phân tích cơ bản:",
        JSON.stringify(basic, null, 2),
        "",
        "Trả về JSON:",
        "{",
        '  "subtasks": [{"step": 1, "goal": "...", "dependsOn": []}],',
        '  "risks": ["rủi ro 1"],',
        '  "alternativeApproaches": ["cách khác"],',
        '  "qualityCriteria": ["tiêu chí"]',
        "}",
      ].join("\n"),
    },
  ];
}

// ============================================================
// TẦNG 3 — CROSS CHECK
// ============================================================

async function analyzeCrossCheck({ userId, req, basic, deep, signal }) {
  const prompt = buildCrossCheckPrompt(req, basic, deep);

  const result = await callAnalysisModel({
    userId,
    tier: "crosscheck",
    strategy: "gemini",
    prompt,
    maxTokens: 1024,
    signal,
  });

  if (result.ok && result.parsed) {
    return {
      matchesUserIntent: result.parsed.matchesUserIntent !== false,
      missingRequirements: toArray(result.parsed.missingRequirements),
      suggestions: toArray(result.parsed.suggestions),
      model: result.model,
      usedFallback: false,
    };
  }

  await logWarn("BOSS: Tầng 3 bỏ qua (không có model)", {
    userId,
    error: result.error,
  });

  return {
    matchesUserIntent: true,
    missingRequirements: [],
    suggestions: [],
    model: null,
    usedFallback: true,
  };
}

function buildCrossCheckPrompt(req, basic, deep) {
  return [
    {
      role: "system",
      content: "Bạn là người kiểm tra. CHỈ trả về JSON.",
    },
    {
      role: "user",
      content: [
        "Yêu cầu gốc:",
        req,
        "",
        "Tầng 1:",
        JSON.stringify(basic, null, 2),
        "",
        "Tầng 2:",
        JSON.stringify(deep, null, 2),
        "",
        "Trả về JSON:",
        "{",
        '  "matchesUserIntent": true,',
        '  "missingRequirements": [],',
        '  "suggestions": []',
        "}",
      ].join("\n"),
    },
  ];
}

// ============================================================
// GỌI MODEL PHÂN TÍCH — CHỌN THEO STRATEGY
// ============================================================

async function callAnalysisModel({ userId, tier, strategy, prompt, maxTokens, signal }) {
  const candidates = getCandidatesForTierAndStrategy(tier, strategy);

  let filtered = await locUngVien(candidates, {
    userId,
    taskType: "classify",
    tier: "dai-nao",
  });

  const tried = new Set();

  for (const c of filtered) {
    if (tried.has(`${c.provider}:${c.name}`)) continue;
    tried.add(`${c.provider}:${c.name}`);

    const result = await tryCallModel({ userId, candidate: c, prompt, maxTokens, signal });
    if (result.ok) {
      return { ...result, parsed: result.parsed, model: c.name };
    }
  }

  await logWarn(`BOSS: ${tier} — dò động toàn bộ`, { userId });

  const dynamic = await doTatCaModelDong({ userId });
  const sorted = dynamic.filter((d) => !tried.has(`${d.provider}:${d.name}`));

  for (const c of sorted) {
    if (tried.has(`${c.provider}:${c.name}`)) continue;
    tried.add(`${c.provider}:${c.name}`);

    const result = await tryCallModel({ userId, candidate: c, prompt, maxTokens, signal });
    if (result.ok) {
      return { ...result, parsed: result.parsed, model: c.name };
    }
  }

  return { ok: false, error: `${tier}: tất cả model đều lỗi` };
}

function getCandidatesForTierAndStrategy(tier, strategy) {
  // Nếu strategy = gemini → ưu tiên Gemini cho mọi tầng
  if (strategy === "gemini") {
    return [
      { name: "gemini-3.1-flash-lite", provider: "gemini", priority: 1 },
      { name: "gemini-3-flash", provider: "gemini", priority: 2 },
      { name: "openai/gpt-oss-120b", provider: "groq", priority: 3 },
      { name: "llama-3.3-70b-versatile", provider: "groq", priority: 4 },
    ];
  }

  // strategy = groq (mặc định)
  if (tier === "basic") {
    return [
      { name: "openai/gpt-oss-120b", provider: "groq", priority: 1 },
      { name: "llama-3.3-70b-versatile", provider: "groq", priority: 2 },
      { name: "meta-llama/llama-4-maverick-17b-128e-instruct", provider: "groq", priority: 3 },
    ];
  }
  if (tier === "deep") {
    return [
      { name: "llama-3.3-70b-versatile", provider: "groq", priority: 1 },
      { name: "openai/gpt-oss-120b", provider: "groq", priority: 2 },
      { name: "qwen/qwen3-235b-a22b:free", provider: "openrouter", priority: 3 },
    ];
  }
  if (tier === "crosscheck") {
    return [
      { name: "meta-llama/llama-4-maverick-17b-128e-instruct", provider: "groq", priority: 1 },
      { name: "openai/gpt-oss-120b", provider: "groq", priority: 2 },
      { name: "deepseek/deepseek-v3.2:free", provider: "openrouter", priority: 3 },
    ];
  }
  return [];
}

async function tryCallModel({ userId, candidate, prompt, maxTokens, signal }) {
  const mod = MODULES[candidate.provider];
  if (!mod) return { ok: false, error: "Provider không hỗ trợ" };

  const keys = await listKeysByProvider(userId, candidate.provider);
  const usable = keys.filter((k) => k.quota !== "out");
  if (usable.length === 0) return { ok: false, error: "Không có key" };

  for (const key of usable) {
    try {
      const res = await mod.chat({
        rawKey: key.rawKey,
        model: candidate.name,
        messages: prompt,
        temperature: 0.1,
        maxTokens,
        signal,
      });

      if (!res.ok) {
        return { ok: false, error: res.error || "Không có output" };
      }

      const parsed = parseJsonSafe(res.text);
      if (parsed) return { ok: true, parsed, raw: res.text };

      return { ok: false, error: "Không parse được JSON" };
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
        continue;
      }
      return { ok: false, error: err?.message || "Lỗi" };
    }
  }

  return { ok: false, error: "Hết key" };
}

function parseJsonSafe(text) {
  if (!text || typeof text !== "string") return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

function toArray(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeTaskType(t, req) {
  const valid = ["code", "bulk", "fix", "summary", "research", "analysis", "read-long-doc"];
  const tt = String(t || "").toLowerCase();
  if (valid.includes(tt)) return tt;
  return guessTaskTypeRegex(req);
}

function detectRedo(req) {
  return /\b(làm lại|sửa lại|thử lại|chưa đủ|chưa đúng|dài hơn|ngắn hơn|khác đi|đổi lại|viết lại|thêm|bớt|tiếp tục)\b/i.test(req);
}

function detectNeedWeb(req) {
  const k = req.toLowerCase();
  return [
    "mới nhất", "hôm nay", "hiện tại", "tin tức", "tra cứu",
    "tìm kiếm", "google", "web", "url", "http", "link",
    "nguồn", "số liệu", "thống kê",
  ].some((w) => k.includes(w));
}

function guessTaskTypeRegex(req) {
  const k = req.toLowerCase();
  if (/\btạo\b/.test(k)) return "code";
  if (/\bviết\b/.test(k)) return "bulk";
  if (/\b(sửa|fix|debug)\b/.test(k)) return "fix";
  if (/\b(tóm tắt|summary)\b/.test(k)) return "summary";
  if (/\b(tra|tìm|search|research)\b/.test(k)) return "research";
  if (/\b(phân tích|analysis)\b/.test(k)) return "analysis";
  return "bulk";
}

function extractLengthRegex(req) {
  const m = req.match(/(\d+)\s*(chữ|ký tự|từ|words?)/i);
  return m ? `${m[1]} ${m[2]}` : "";
}

export default { phanTichYeuCau };