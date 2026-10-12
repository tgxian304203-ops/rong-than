// server/boss/phan-tich-yeu-cau.js
// Nhiệm vụ: BOSS phân tích yêu cầu User — 3 TẦNG.
//
// TẦNG 1 — Basic Analysis (bắt buộc):
//   taskType, goal, requirements, constraints, expectedOutput...
//   Fallback: regex cũ nếu tất cả model lỗi.
//
// TẦNG 2 — Deep Analysis (tùy chọn):
//   subtasks, risks, alternativeApproaches, qualityCriteria...
//
// TẦNG 3 — Cross Check (tùy chọn):
//   matchesUserIntent, missingRequirements, suggestions...
//
// Mỗi tầng có fallback toàn bộ model có sẵn.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
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

  await logInfo("BOSS: === BẮT ĐẦU PHÂN TÍCH 3 TẦNG ===", {
    userId,
    conversationId,
    textLength: req.length,
    historyCount: history.length,
  });

  // ============================================================
  // TẦNG 1 — BASIC ANALYSIS
  // ============================================================
  const t1Start = Date.now();
  const basic = await analyzeBasic({ userId, req, history, signal });
  const t1Duration = Date.now() - t1Start;

  await logInfo("BOSS: Tầng 1 hoàn thành", {
    userId,
    durationMs: t1Duration,
    taskType: basic.taskType,
    usedFallback: basic.usedFallback,
    model: basic.model,
  });

  // ============================================================
  // TẦNG 2 — DEEP ANALYSIS
  // ============================================================
  const t2Start = Date.now();
  const deep = await analyzeDeep({ userId, req, basic, history, signal });
  const t2Duration = Date.now() - t2Start;

  await logInfo("BOSS: Tầng 2 hoàn thành", {
    userId,
    durationMs: t2Duration,
    subtaskCount: deep.subtasks?.length || 0,
    usedFallback: deep.usedFallback,
    model: deep.model,
  });

  // ============================================================
  // TẦNG 3 — CROSS CHECK
  // ============================================================
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

  // ============================================================
  // TỔNG HỢP
  // ============================================================
  const totalDuration = Date.now() - startTime;

  const analysis = {
    // Tầng 1
    taskType: basic.taskType,
    goal: basic.goal,
    requirements: basic.requirements || [],
    constraints: basic.constraints || [],
    expectedOutput: basic.expectedOutput || "",
    length: basic.length || "",
    tone: basic.tone || "",
    targetAudience: basic.targetAudience || "",
    language: basic.language || "vi",

    // Tầng 2
    subtasks: deep.subtasks || [],
    risks: deep.risks || [],
    alternativeApproaches: deep.alternativeApproaches || [],
    qualityCriteria: deep.qualityCriteria || [],

    // Tầng 3
    matchesUserIntent: crossCheck.matchesUserIntent !== false,
    missingRequirements: crossCheck.missingRequirements || [],
    suggestions: crossCheck.suggestions || [],

    // Metadata
    needWeb: userLabel === "need_web" || detectNeedWeb(req),
    needCode: userLabel === "need_code" || basic.taskType === "code",
    isRedo: basic.isRedo,
    inheritedTaskType: basic.inheritedTaskType,
    rawLength: req.length,
    totalDuration,
  };

  await logInfo("BOSS: === KẾT THÚC PHÂN TÍCH 3 TẦNG ===", {
    userId,
    totalDurationMs: totalDuration,
    taskType: analysis.taskType,
    subtaskCount: analysis.subtasks.length,
    missingCount: analysis.missingRequirements.length,
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
// TẦNG 1 — BASIC ANALYSIS
// ============================================================

async function analyzeBasic({ userId, req, history, signal }) {
  const prompt = buildBasicPrompt(req, history);

  const result = await callAnalysisModel({
    userId,
    tier: "basic",
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

  // ===== FALLBACK REGEX =====
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
    '  "tone": "phong cách (nghiêm túc/thân thiện/...)",',
    '  "targetAudience": "đối tượng hướng tới",',
    '  "language": "vi",',
    '  "isRedo": false,',
    '  "inheritedTaskType": null',
    "}",
    "",
    "Quy tắc:",
    '- Có từ "tạo" → taskType = "code"',
    '- Có từ "viết" → taskType = "bulk"',
    '- Nếu là yêu cầu "làm lại", "chưa đủ", "sửa lại" → isRedo = true + inheritedTaskType = taskType của yêu cầu trước',
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
      content:
        "Bạn là bộ phân tích. CHỈ trả về JSON. Không thêm text, không thêm ```json```.",
    },
    { role: "user", content: lines.join("\n") },
  ];
}

// ============================================================
// TẦNG 2 — DEEP ANALYSIS
// ============================================================

async function analyzeDeep({ userId, req, basic, history, signal }) {
  const prompt = buildDeepPrompt(req, basic, history);

  const result = await callAnalysisModel({
    userId,
    tier: "deep",
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

function buildDeepPrompt(req, basic, history) {
  return [
    {
      role: "system",
      content:
        "Bạn là chuyên gia phân tích nhiệm vụ. CHỈ trả về JSON. Không thêm gì khác.",
    },
    {
      role: "user",
      content: [
        "Yêu cầu gốc:",
        req,
        "",
        "Phân tích cơ bản (đã có):",
        `- taskType: ${basic.taskType}`,
        `- goal: ${basic.goal}`,
        `- length: ${basic.length}`,
        `- tone: ${basic.tone}`,
        "",
        "Hãy phân tích chuyên sâu. Trả về JSON:",
        "{",
        '  "subtasks": [{"step": 1, "goal": "...", "dependsOn": []}],',
        '  "risks": ["rủi ro 1"],',
        '  "alternativeApproaches": ["cách khác"],',
        '  "qualityCriteria": ["tiêu chí đánh giá"]',
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
      content: "Bạn là người kiểm tra. CHỈ trả về JSON. Không thêm gì khác.",
    },
    {
      role: "user",
      content: [
        "Yêu cầu gốc:",
        req,
        "",
        "Phân tích tầng 1:",
        JSON.stringify(basic, null, 2),
        "",
        "Phân tích tầng 2:",
        JSON.stringify(deep, null, 2),
        "",
        "Kiểm tra xem phân tích có đúng ý User không. Trả về JSON:",
        "{",
        '  "matchesUserIntent": true,',
        '  "missingRequirements": ["yêu cầu bị bỏ sót"],',
        '  "suggestions": ["gợi ý cải thiện"]',
        "}",
      ].join("\n"),
    },
  ];
}

// ============================================================
// GỌI MODEL PHÂN TÍCH — FALLBACK TOÀN BỘ
// ============================================================

async function callAnalysisModel({ userId, tier, prompt, maxTokens, signal }) {
  // 1. Ứng viên tĩnh theo tầng
  const staticCandidates = getStaticCandidatesForTier(tier);

  // 2. Lọc + sắp xếp
  let candidates = await locUngVien(staticCandidates, {
    userId,
    taskType: "classify",
    tier: "dai-nao",
  });

  // 3. Thử từng ứng viên
  const tried = new Set();

  for (const c of candidates) {
    if (tried.has(`${c.provider}:${c.name}`)) continue;
    tried.add(`${c.provider}:${c.name}`);

    const result = await tryCallModel({ userId, candidate: c, prompt, maxTokens, signal });
    if (result.ok) {
      return { ...result, parsed: result.parsed, model: c.name };
    }
  }

  // 4. Nếu hết ứng viên tĩnh → dò động TẤT CẢ model
  await logWarn(`BOSS: ${tier} — ứng viên tĩnh hết, dò động toàn bộ`, {
    userId,
  });

  const dynamic = await doTatCaModelDong({ userId });
  await logInfo(`BOSS: ${tier} — dò được model động`, {
    userId,
    count: dynamic.length,
  });

  // Sắp xếp theo sức mạnh
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

function getStaticCandidatesForTier(tier) {
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
      if (parsed) {
        return { ok: true, parsed, raw: res.text };
      }

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

  // Bỏ ```json ... ```
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  // Tìm { ... } đầu tiên
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  const jsonStr = s.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
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
  return /\b(làm lại|sửa lại|thử lại|chưa đủ|chưa đúng|dài hơn|ngắn hơn|khác đi|đổi lại|viết lại|thêm|bớt|tiếp tục)\b/i.test(
    req
  );
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