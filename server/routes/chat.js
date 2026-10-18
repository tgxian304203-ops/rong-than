// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS như ChatGPT.
// Cập nhật: BOSS TỰ SỬA CODE (không qua Lính), set giới hạn 60.000 tokens, fix 3 lỗi logic.

import express from "express";
import multer from "multer";

import {
  createConversation, listRecentConversations, getConversation,
  deleteConversation as dbDeleteConversation, deleteAllNonProjectConversations, updateConversationTitle,
} from "../db/conversations.js";
import { listMessages, listRecentMessages } from "../db/messages.js";
import { saveAttachment, listByMessage as listAttachmentsByMessage } from "../db/attachments.js";
import { getLatestAny as getLatestCodeArtifact, saveArtifact } from "../db/codeArtifacts.js";

import { nhanYeuCau as gwNhanYeuCau } from "../gateway/nhan-yeu-cau.js";
import { chuyenYeuCauChoBoss } from "../gateway/chuyen-yeu-cau-cho-boss.js";
import { nhanKetQuaTuBoss } from "../gateway/nhan-ket-qua-tu-boss.js";
import { traKetQuaChoUser } from "../gateway/tra-ket-qua-cho-user.js";

import { nhanYeuCau as bossNhanYeuCau } from "../boss/nhan-yeu-cau.js";
import { traWeb, formatWebResults } from "../boss/tra-web.js";
import { giaoFormat } from "../boss/giao-format.js";
import { nhanKetQuaLinh } from "../boss/nhan-ket-qua-linh.js";
import { kiemTraSandbox } from "../boss/kiem-tra-sandbox.js";

import { goiBoss } from "../dai-nao/goi-boss.js";
import { goiBossMoi } from "../dai-nao/goi-boss-moi.js";

import { goiLinh } from "../tieu-nao/goi-linh.js";
import { chunkText } from "../utils/chunker.js";
import { countTokens, countMessagesTokens } from "../utils/token-counter.js";

import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const HISTORY_FOR_BOSS = 500;
const HISTORY_FOR_SOLDIER = 400;
const SANDBOX_TIME_BUDGET_MS = 5 * 60 * 1000;
const MAX_FIX_ITERATIONS = 5;

const BOSS_MAX_OUTPUT_TOKENS = 32768;
const BOSS_FIX_MAX_OUTPUT_TOKENS = 60000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_UPLOAD_BYTES, files: LIMITS.MAX_ATTACHMENTS_PER_MESSAGE },
});

function getUserId(req) {
  const v = req.headers["x-user-id"];
  return v ? String(v) : null;
}

async function attachFilesToMessage(msg) {
  if (!msg) return msg;
  try {
    const atts = await listAttachmentsByMessage(String(msg._id));
    const mapped = atts.map((a) => ({
      id: String(a._id), name: a.name, type: a.type, size: a.size, url: a.url || "", dataUrl: a.dataUrl || "",
    }));
    return { ...msg, id: String(msg._id), attachments: mapped };
  } catch {
    return { ...msg, id: String(msg._id), attachments: [] };
  }
}

async function loadConversationHistory(conversationId, limit) {
  try { return await listRecentMessages(conversationId, limit); } catch { return []; }
}

// [FIX 1] Đảm bảo lỗi luôn là string
function errString(e) {
  if (typeof e === "string") return e;
  if (e && typeof e.message === "string") return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function extractCodeFromRequest(userRequest) {
  if (!userRequest || typeof userRequest !== "string") return null;
  const blockMatch = userRequest.match(/```([a-zA-Z0-9+\-#.]*)\n([\s\S]*?)```/);
  if (blockMatch) { const lang = (blockMatch[1] || "").toLowerCase().trim() || "html"; const code = (blockMatch[2] || "").trim(); if (code) return { language: lang, code }; }
  const htmlDoctype = userRequest.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
  if (htmlDoctype) return { language: "html", code: htmlDoctype[1].trim() };
  const htmlNoDoctype = userRequest.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlNoDoctype) return { language: "html", code: htmlNoDoctype[1].trim() };
  const jsMatch = userRequest.match(/((?:function\s+|const\s+|let\s+|class\s+)[\s\S]+)/i);
  if (jsMatch) return { language: "javascript", code: jsMatch[1].trim() };
  const pyMatch = userRequest.match(/((?:def\s+|class\s+|import\s+|from\s+)[\s\S]+)/i);
  if (pyMatch) return { language: "python", code: pyMatch[1].trim() };
  return null;
}

function extractTestSandboxFallback(userRequest, parsed) {
  if (parsed?.type !== "text") return null;
  if (typeof parsed?.text !== "string") return null;
  if (!/"tool"\s*:\s*"test_sandbox"/.test(parsed.text)) return null;
  const extracted = extractCodeFromRequest(userRequest);
  if (!extracted) return null;
  return { type: "tool", tool: "test_sandbox", args: { language: extracted.language, code: extracted.code } };
}

// ============================================================
// VÒNG LẶP BOSS TỰ SỬA CODE
// ============================================================
async function runBossFixLoop({ userId, conversationId, userRequest, language, code, initialError, currentVersion = 0, signal }) {
  let currentCode = code;
  let lastError = errString(initialError);
  let iteration = 0;
  const startTime = Date.now();

  await logInfo("BOSS: Bắt đầu tự sửa code", { userId, conversationId, initialError: lastError.slice(0, 100) });

  while (iteration < MAX_FIX_ITERATIONS) {
    if (Date.now() - startTime > SANDBOX_TIME_BUDGET_MS) break;
    iteration++;

    await logInfo(`BOSS: Tự sửa vòng ${iteration}`, { userId, conversationId });

    const fixMessages = buildBossFixCodeMessages({ userRequest, failedCode: currentCode, stderr: lastError, language });
    const bossRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: fixMessages, temperature: 0.2, maxTokens: BOSS_FIX_MAX_OUTPUT_TOKENS, signal });

    if (!bossRes.ok || !bossRes.text) {
      lastError = errString(bossRes.error || "BOSS không phản hồi");
      continue;
    }

    let validation = validateCodeOutput(bossRes.text);
    
    // [FIX 3] Nếu BOSS trả về text, thử vét code trong đó
    if (!validation.ok) {
      const extracted = extractCodeFromRequest(bossRes.text);
      if (extracted) {
        validation = { ok: true, code: extracted.code, language: extracted.language };
      }
    }

    if (validation.ok && validation.code) {
      currentCode = validation.code;
      language = validation.language || language;
    } else {
      lastError = `BOSS trả về text không có code block: ${bossRes.text.slice(0, 200)}...`;
      continue;
    }

    const testRes = await kiemTraSandbox({ userId, conversationId, language, code: currentCode, testCode: "", signal });
    
    if (testRes.ok) {
      try { 
        // [FIX 2] Lưu đúng version
        await saveArtifact({ userId, conversationId, language, code: currentCode, version: currentVersion + 1 }); 
      } catch {}
      return { ok: true, code: currentCode, language, iterations: iteration, sandboxMeta: { status: testRes.status } };
    }
    lastError = errString(testRes.stderr || testRes.error || "Lỗi không rõ");
  }

  try { await saveArtifact({ userId, conversationId, language, code: currentCode, version: currentVersion + 1 }); } catch {}
  return { ok: false, code: currentCode, language, iterations: iteration, sandboxMeta: { status: "failed" }, error: "Đã hết lượt sửa hoặc hết thời gian." };
}

// ============================================================
// PIPELINE BOSS
// ============================================================
async function runBossPipeline({ userId, conversationId, userRequest, userLabel, signal }) {
  const recv = await bossNhanYeuCau({ userId, conversationId, userRequest, userLabel });
  if (!recv.ok) return { ok: false, error: recv.error };

  const history = await loadConversationHistory(conversationId, HISTORY_FOR_BOSS);
  const historyCtx = history.slice(0, -1);

  let currentCode = null;
  try {
    const artifact = await getLatestCodeArtifact(conversationId);
    if (artifact && artifact.code) {
      currentCode = { code: artifact.code, language: artifact.language || "html", version: artifact.version || 1 };
    }
  } catch {}

  await logInfo("BOSS: đọc ngữ cảnh", { userId, conversationId, historyCount: historyCtx.length, hasCode: !!currentCode });

  const bossMessages = buildBossMessages({ userRequest, history: historyCtx, currentCode });

  let bossRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: bossMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  if (!bossRes.ok) {
    bossRes = await goiBossMoi({ userId, conversationId, oldSession: null, messages: bossMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  }
  if (!bossRes.ok || !bossRes.text) return { ok: false, error: bossRes.error || "BOSS không trả lời được" };

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;
  let parsed = parseBossOutput(bossRes.text);

  if (parsed.type === "text") {
    const fallback = extractTestSandboxFallback(userRequest, parsed);
    if (fallback) { await logInfo("BOSS: fallback trích code từ userRequest", { userId, conversationId }); parsed = fallback; }
  }

  await logInfo("BOSS: quyết định", { userId, conversationId, type: parsed.type, tool: parsed.tool || null });

  if (parsed.type === "text") return { ok: true, text: parsed.text, meta: { action: "reply" } };

  // ===== TEST_SANDBOX =====
  if (parsed.type === "tool" && parsed.tool === "test_sandbox") {
    const args = parsed.args || {};
    let language = args.language || "html";
    let code = args.code || "";
    if (!code) { const extracted = extractCodeFromRequest(userRequest); if (extracted) { code = extracted.code; language = extracted.language; } }
    if (!code) return { ok: true, text: "Không tìm thấy code để kiểm tra.", meta: { action: "test-sandbox-empty" } };

    const testRes = await kiemTraSandbox({ userId, conversationId, language, code, testCode: "", signal });
    
    if (testRes.ok) {
      try { await saveArtifact({ userId, conversationId, language, code, version: (currentCode?.version || 0) + 1 }); } catch {}
      return { ok: true, text: "✅ Code của bạn đã vượt qua kiểm thử (không có lỗi).", meta: { action: "test-sandbox-pass", sandbox: { status: testRes.status } } };
    }

    const initialError = errString(testRes.stderr || testRes.error || "Không rõ lỗi");
    const fixResult = await runBossFixLoop({ userId, conversationId, userRequest, language, code, initialError, currentVersion: (currentCode?.version || 0), signal });

    if (fixResult.ok) {
      return { ok: true, text: `✅ Đã phát hiện lỗi và tự động sửa thành công.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "test-sandbox-fixed", sandbox: fixResult.sandboxMeta } };
    } else {
      return { ok: true, text: `⚠ Code có lỗi, đã cố gắng sửa nhưng vẫn thất bại.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\`\n\nLỗi cuối cùng: ${fixResult.error}`, meta: { action: "test-sandbox-fail-fixed", sandbox: fixResult.sandboxMeta } };
    }
  }

  // ===== SEARCH_WEB =====
  if (parsed.type === "tool" && parsed.tool === "search_web") {
    const query = parsed.args?.query || userRequest;
    const web = await traWeb({ userId, conversationId, query, signal });
    const webContext = web.ok ? formatWebResults(web.results) : "";
    const finalMessages = buildBossAfterWebMessages({ userRequest, webContext, history: historyCtx });
    const finalRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: finalMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
    return { ok: true, text: finalRes.ok ? finalRes.text : `Không tra được web. ${web.error || ""}`, meta: { action: "web", web: { used: true, ok: web.ok } } };
  }

  // ===== DELEGATE_SOLDIER =====
  if (parsed.type === "tool" && parsed.tool === "delegate_soldier") {
    const args = parsed.args || {};
    const taskType = args.taskType || "bulk";
    const goal = args.goal || userRequest;
    const requestTokens = countTokens(userRequest);

    if (requestTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) return await runChunkedDelegate({ userId, conversationId, userRequest, bossSessionId, historyCtx, history, signal });

    if (taskType === "fix-code") {
      let codeToFix = currentCode?.code || extractCodeFromRequest(userRequest)?.code;
      let lang = currentCode?.language || extractCodeFromRequest(userRequest)?.language || "html";
      
      if (!codeToFix) return { ok: true, text: "Không tìm thấy code để sửa.", meta: { action: "fix-empty" } };
      
      const fixResult = await runBossFixLoop({ userId, conversationId, userRequest, language: lang, code: codeToFix, initialError: "Người dùng yêu cầu sửa lỗi.", currentVersion: (currentCode?.version || 0), signal });
      if (fixResult.ok) return { ok: true, text: `✅ Đã sửa xong.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "boss-fixed" } };
      return { ok: true, text: `⚠ Chưa sửa được hoàn chỉnh.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "boss-fix-fail" } };
    }

    const format = { taskType, goal, requirements: args.requirements || [], constraints: args.constraints || [], expectedOutput: args.expectedOutput || "", needCode: taskType === "code" || taskType === "fix-code", currentCode: currentCode || null, isModify: !!currentCode, subtasks: [], risks: [], qualityCriteria: [] };
    
    const giao = await giaoFormat({ userId, conversationId, bossSessionId, format, tokens: countTokens(userRequest) });
    if (!giao.ok) return { ok: false, error: giao.error };
    
    const soldierMessages = buildSoldierMessages({ format, history: history.slice(-HISTORY_FOR_SOLDIER), userRequest, currentCode });
    const linh = await goiLinh({ userId, taskId: giao.taskId, taskType: giao.taskType, messages: soldierMessages, payload: format, temperature: 0.3, maxTokens: 8192, signal });
    
    if (!linh.ok) return { ok: false, error: linh.error || "Lính không hoàn thành" };
    
    const validation = validateCodeOutput(linh.text);
    if (!validation.ok) return { ok: false, error: "Lính không trả về code hợp lệ." };

    const testRes = await kiemTraSandbox({ userId, conversationId, language: validation.language, code: validation.code, testCode: "", signal });
    
    if (testRes.ok) {
      try { await saveArtifact({ userId, conversationId, language: validation.language, code: validation.code, version: (currentCode?.version || 0) + 1 }); } catch {}
      return { ok: true, text: `✅ Code đã hoàn thành và vượt qua kiểm thử.\n\n\`\`\`${validation.language}\n${validation.code}\n\`\`\``, meta: { action: "delegate-pass" } };
    }

    const initialError = errString(testRes.stderr || testRes.error || "Không rõ lỗi");
    const fixResult = await runBossFixLoop({ userId, conversationId, userRequest, language: validation.language, code: validation.code, initialError, currentVersion: (currentCode?.version || 0), signal });

    if (fixResult.ok) {
      return { ok: true, text: `✅ Code đã được tạo và tự động sửa lỗi thành công.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "delegate-fixed" } };
    } else {
      return { ok: true, text: `⚠ Code đã tạo nhưng còn lỗi, sửa chưa xong.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "delegate-fail" } };
    }
  }

  return { ok: true, text: parsed.text || bossRes.text, meta: { action: "reply-fallback" } };
}

// Các hàm prompt (giữ nguyên)
function buildBossMessages({ userRequest, history = [], currentCode = null }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là Rồng Thần — BOSS, trợ lý AI thông minh.\n" +
        "1. 🧠 LÍNH: Viết code mới.\n" +
        "2. 🌐 WEB: Tra cứu internet.\n" +
        "3. 🧪 SANDBOX: Kiểm thử code.\n" +
        "4. BẠN LÀ NGƯỜI SỬA CODE: Nếu code có lỗi, BẠN sẽ tự sửa.\n\n" +
        "QUY TẮC PHÂN BIỆT:\n" +
        "🅰️ KIỂM TRA CODE: User dán code + 'kiểm tra', 'check', 'có lỗi không' -> Gọi tool 'test_sandbox'.\n" +
        "🅱️ LÀM CODE MỚI: User nói 'làm', 'tạo', 'viết' -> Gọi 'delegate_soldier' với taskType='code'.\n" +
        "🅲 SỬA CODE: User nói 'sửa lỗi', 'fix' -> Gọi 'delegate_soldier' với taskType='fix-code'.\n\n" +
        "CÁCH TRẢ LỜI:\n" +
        "【Chat】→ TEXT tự nhiên.\n" +
        "【Test Sandbox】→ {\"tool\": \"test_sandbox\", \"args\": {\"language\": \"html|javascript|python\"}}\n" +
        "【Tra web】→ {\"tool\": \"search_web\", \"args\": {\"query\": \"...\"}}\n" +
        "【Giao lính】→ {\"tool\": \"delegate_soldier\", \"args\": {\"taskType\": \"code|fix-code|bulk|summary\", \"goal\": \"...\", \"requirements\": [], \"constraints\": [], \"expectedOutput\": \"...\"}}\n\n" +
        "KHÔNG dùng LaTeX hay $$. Chỉ trả JSON khi gọi tool.",
    },
  ];

  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text });
  }

  if (currentCode) {
    messages.push({ role: "user", content: `[NGỮ CẢNH]\nĐang có code v${currentCode.version} (${currentCode.language}).` });
  }

  messages.push({ role: "user", content: userRequest });
  return messages;
}

function buildBossAfterWebMessages({ userRequest, webContext, history = [] }) {
  const messages = [
    { role: "system", content: "Bạn là Rồng Thần. Vừa tra web xong.\nĐọc dữ liệu → trả lời User tự nhiên bằng tiếng Việt.\nKHÔNG nhắc 'công cụ'.\nTrích nguồn URL nếu có." },
  ];
  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text });
  }
  messages.push({ role: "user", content: ["Yêu cầu của User:", userRequest, "", "Dữ liệu tra cứu:", webContext || "(không có)", "", "Trả lời User dựa trên dữ liệu trên."].join("\n") });
  return messages;
}

function parseBossOutput(text) {
  if (!text || typeof text !== "string") return { type: "text", text: "(Không có nội dung)" };
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(s.slice(start, end + 1));
      if (obj.tool) return { type: "tool", tool: obj.tool, args: obj.args || {} };
    } catch {}
  }
  return { type: "text", text: s };
}

function buildBossFixCodeMessages({ userRequest, failedCode, stderr, language }) {
  return [
    {
      role: "system",
      content:
        "Bạn là BOSS. Code của bạn bị lỗi Sandbox.\n" +
        "Nhiệm vụ của bạn là ĐỌC LỖI, SỬA LẠI CODE và TRẢ VỀ TOÀN BỘ CODE ĐÃ SỬA.\n" +
        "CẢNH BÁO: Code này rất dài. TUYỆT ĐỐI KHÔNG viết lại từ đầu. Chỉ được phép thay thế chính xác đoạn code bị lỗi và giữ nguyên các phần khác.\n" +
        "KHÔNG giải thích dài dòng, KHÔNG dùng shell commands.\n" +
        "BẮT BUỘC trả về TOÀN BỘ CODE HOÀN CHỈNH trong ```<ngôn ngữ>...```."
    },
    {
      role: "user",
      content: [
        "Yêu cầu gốc:", userRequest, "",
        "Ngôn ngữ:", language, "",
        "Lỗi Sandbox báo:", "```", stderr, "```", "",
        "Code hiện tại bị lỗi:", "```" + language, failedCode, "```", "",
        "Hãy sửa và trả về TOÀN BỘ CODE hoàn chỉnh (đặt trong ```<ngôn ngữ> ... ```)."
      ].join("\n"),
    },
  ];
}

function buildSoldierMessages({ format, history = [], userRequest, currentCode = null }) {
  const messages = [{ role: "system", content: "Bạn là lính. Viết code theo format BOSS giao.\n1. Trả về TOÀN BỘ CODE.\n2. Không dùng shell.\n3. Đặt trong ```<lang>...```." }];
  for (const m of history) { if (!m.text || !m.text.trim()) continue; messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  const lines = ["YÊU CẦU GỐC:", userRequest, "", "FORMAT BOSS GIAO:", format.goal];
  if (format.constraints?.length) { lines.push("", "Ràng buộc:"); for (const c of format.constraints) lines.push(`- ${c}`); }
  if (currentCode?.code) lines.push("", `CODE HIỆN TẠI:`, "```" + (currentCode.language || "html"), currentCode.code, "```");
  lines.push("", "Làm việc.");
  messages.push({ role: "user", content: lines.join("\n") });
  return messages;
}

function validateCodeOutput(text) {
  if (!text || typeof text !== "string") return { ok: false, reason: "Không có nội dung" };
  const codeBlocks = [];
  const re = /```([a-zA-Z0-9+\-#.]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(text)) !== null) { codeBlocks.push({ lang: (match[1] || "").toLowerCase().trim(), body: match[2] || "" }); }
  if (codeBlocks.length === 0) return { ok: false, reason: "Không có code block" };
  for (const block of codeBlocks) {
    const body = block.body.trim();
    if (isShellScript(body)) continue;
    if (block.lang === "html" || block.lang === "htm") { if (isRealHtml(body)) return { ok: true, code: body, language: "html" }; continue; }
    if (block.lang === "javascript" || block.lang === "js") { if (isRealJavaScript(body)) return { ok: true, code: body, language: "javascript" }; continue; }
    if (block.lang === "python" || block.lang === "py") { if (isRealPython(body)) return { ok: true, code: body, language: "python" }; continue; }
  }
  if (codeBlocks.some((b) => isShellScript(b.body))) return { ok: false, reason: "Shell/git — cần code chạy được" };
  return { ok: false, reason: "Code block không hợp lệ" };
}

function isShellScript(body) {
  const patterns = [/^\s*git\s+(init|add|commit|push|pull|clone|remote|checkout|branch|merge|status|log)/m, /^\s*npm\s+(install|run|start|init|build|test)/m, /^\s*yarn\s+(install|add|run|start)/m, /^\s*cd\s+[a-zA-Z]/m, /^\s*mkdir\s+/m, /^\s*rm\s+-rf/m, /^\s*touch\s+/m, /^\s*chmod\s+/m, /^\s*chown\s+/m, /^\s*export\s+[A-Z_]+=/m, /^\s*sudo\s+/m, /^\s*apt-get\s+/m, /^\s*brew\s+install/m, /^\s*pip\s+install/m, /^\s*python\s+-m/m, /^\s*node\s+[a-zA-Z]/m, /^\s*curl\s+-/m, /^\s*wget\s+/m, /^\s*docker\s+/m];
  const lines = body.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  const shellLines = lines.filter((l) => patterns.some((p) => p.test(l))).length;
  return shellLines / lines.length > 0.5;
}

function isRealHtml(body) { let count = 0; if (/<html[\s>]/i.test(body)) count++; if (/<head[\s>]/i.test(body)) count++; if (/<body[\s>]/i.test(body)) count++; if (/<div[\s>]/i.test(body)) count++; if (/<p[\s>]/i.test(body)) count++; if (/<script[\s>]/i.test(body)) count++; if (/<h[1-6][\s>]/i.test(body)) count++; return count >= 2; }
function isRealJavaScript(body) { return /(function\s+|const\s+|let\s+|var\s+|=>|class\s+|import\s+|export\s+)/i.test(body); }
function isRealPython(body) { return /(def\s+|class\s+|import\s+|from\s+|print\s*\()/i.test(body); }

async function runChunkedDelegate({ userId, conversationId, userRequest, bossSessionId, historyCtx, history, signal }) {
  const chunks = chunkText(userRequest);
  await logInfo("BOSS: chạy pipeline CHUNKED", { userId, conversationId, chunkCount: chunks.length });
  const outputs = [];
  const codeChunks = [];
  let lastLanguage = "html";
  for (let i = 0; i < chunks.length; i++) {
    const chunkReq = `[PHẦN ${i + 1}/${chunks.length}]\n${chunks[i]}`;
    const format = { taskType: "code", goal: `Hoàn thành phần ${i + 1}/${chunks.length}: ${chunks[i].slice(0, 200)}`, needCode: true, requirements: [], constraints: [], expectedOutput: "", subtasks: [], risks: [], qualityCriteria: [] };
    const giao = await giaoFormat({ userId, conversationId, bossSessionId, format, tokens: countTokens(chunkReq) });
    if (!giao.ok) continue;
    const soldierMessages = buildSoldierMessages({ format, history: [], userRequest: chunkReq, currentCode: null });
    const linh = await goiLinh({ userId, taskId: giao.taskId, taskType: giao.taskType, messages: soldierMessages, payload: format, temperature: 0.3, maxTokens: 8192, signal });
    if (!linh.ok) continue;
    const validation = validateCodeOutput(linh.text || "");
    if (!validation.ok) { outputs.push(`[Phần ${i + 1}]\n${linh.text || ""}`); continue; }
    const lang = validation.language;
    const code = validation.code;
    lastLanguage = lang;
    codeChunks.push(code);
    outputs.push(`[Phần ${i + 1}]\n\`\`\`${lang}\n${code}\n\`\`\``);
  }
  let finalText = outputs.join("\n\n");
  let codeMeta = null;
  let sandboxStatus = "not_run";
  if (codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);
    try {
      const testRes = await kiemTraSandbox({ userId, conversationId, language: lastLanguage, code: mergedCode, testCode: "", signal });
      sandboxStatus = testRes.ok ? "passed" : "failed";
      await logInfo("BOSS: Sandbox code ghép", { userId, conversationId, status: testRes.status, version: testRes.version });
    } catch {}
    try {
      const saved = await saveArtifact({ userId, conversationId, language: lastLanguage, code: mergedCode, version: 1 });
      codeMeta = { language: lastLanguage, version: saved.version, artifactId: String(saved._id) };
    } catch {}
    if (sandboxStatus === "passed") finalText = `✅ Code đã vượt qua kiểm thử.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\``;
    else finalText = `⚠ Code chưa vượt qua kiểm thử.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\`\n\nBạn có thể bấm **🔧 Sửa tiếp** để mình tiếp tục sửa.`;
  }
  return { ok: true, text: finalText, meta: { action: "delegate-chunked", code: codeMeta, chunked: true, chunkCount: chunks.length, resumeAvailable: sandboxStatus === "failed" } };
}

function mergeCodeChunks(codeChunks, language) {
  if (!Array.isArray(codeChunks) || codeChunks.length === 0) return "";
  if (language === "html") {
    let bodyContent = "";
    let headContent = "";
    for (const chunk of codeChunks) {
      const headMatch = chunk.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      if (headMatch) headContent += "\n" + headMatch[1];
      const bodyMatch = chunk.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) bodyContent += "\n" + bodyMatch[1];
      else bodyContent += "\n" + chunk;
    }
    return `<!DOCTYPE html>\n<html lang="vi">\n<head>\n${headContent}\n</head>\n<body>\n${bodyContent}\n</body>\n</html>`;
  }
  return codeChunks.join("\n\n");
}

router.post("/send", (req, res, next) => { upload.array("attachments", 10)(req, res, (err) => { if (err) { logWarn("Multer upload lỗi", { error: err?.message || String(err) }); return res.status(400).json({ ok: false, message: err?.message || "Lỗi upload" }); } next(); }); }, async (req, res) => {
  try {
    const userId = getUserId(req);
    const files = Array.isArray(req.files) ? req.files : [];
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const conversationId = req.body?.conversationId;
    let text = String(req.body?.text || "").trim();
    if (!conversationId) return res.status(400).json({ ok: false, message: "Thiếu conversationId" });
    if (!text && files.length === 0) return res.status(400).json({ ok: false, message: "Tin nhắn rỗng" });
    if (!text && files.length > 0) text = "[Ảnh đính kèm]";

    const recv = await gwNhanYeuCau({ userId, conversationId, text, attachments: [] });
    if (!recv.ok) return res.status(400).json({ ok: false, message: recv.error });

    const savedAttachments = [];
    if (files.length > 0 && recv.userMessage?._id) {
      for (const f of files) {
        try {
          const isImage = String(f.mimetype || "").startsWith("image/");
          const tooBig = isImage && f.size > MAX_IMAGE_BYTES;
          let dataUrl = "";
          if (isImage && !tooBig) dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
          const att = await saveAttachment({ userId, conversationId, messageId: String(recv.userMessage._id), name: f.originalname || "tệp", type: f.mimetype || "application/octet-stream", size: f.size || 0, url: "", dataUrl });
          savedAttachments.push({ id: String(att._id), name: att.name, type: att.type, size: att.size, url: "", dataUrl: att.dataUrl || "" });
        } catch (e) { await logWarn("Không lưu được tệp đính kèm", { error: e?.message || String(e) }); }
      }
    }

    let bossUserRequest = String(text || "");
    if (savedAttachments.length > 0) {
      const attachDesc = savedAttachments.map((a, i) => `[${i + 1}] ${a.name} — ${a.type} — ${a.size} bytes`).join("\n");
      bossUserRequest = `${bossUserRequest}\n\n[Tệp đính kèm: ${savedAttachments.length}]\n${attachDesc}`;
    }

    const bossResult = await chuyenYeuCauChoBoss({ userId, conversationId, userRequest: bossUserRequest, userLabel: null, runBoss: runBossPipeline });
    const received = await nhanKetQuaTuBoss({ userId, conversationId, bossResult });
    if (!received.ok) return res.status(500).json({ ok: false, message: received.error });
    const delivered = await traKetQuaChoUser({ userId, conversationId, text: received.text, meta: received.meta });
    if (!delivered.ok) return res.status(500).json({ ok: false, message: delivered.error });

    return res.json({ ok: true, userMessage: { ...recv.userMessage, id: String(recv.userMessage._id), attachments: savedAttachments }, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } });
  } catch (err) { await logWarn("Lỗi /chat/send", { error: err?.message || String(err) }); return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.post("/fix-continue", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const conversationId = req.body?.conversationId;
    if (!conversationId) return res.status(400).json({ ok: false, message: "Thiếu conversationId" });
    try { await gwNhanYeuCau({ userId, conversationId, text: "🔧 Sửa tiếp", attachments: [] }); } catch {}
    
    const latest = await getLatestCodeArtifact(conversationId);
    if (!latest || !latest.code) return res.status(400).json({ ok: false, message: "Không có code để sửa." });

    const fixResult = await runBossFixLoop({ userId, conversationId, userRequest: "Sửa tiếp code cho tới khi hết lỗi", language: latest.language || "html", code: latest.code, initialError: "Người dùng yêu cầu sửa tiếp.", currentVersion: (latest.version || 0), signal: null });
    
    const finalText = fixResult.ok 
      ? `✅ Đã sửa xong.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``
      : `⚠ Chưa sửa xong hoàn toàn.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``;

    const delivered = await traKetQuaChoUser({ userId, conversationId, text: finalText, meta: { action: "resume-fixed" } });
    if (!delivered.ok) return res.status(500).json({ ok: false, message: delivered.error });
    return res.json({ ok: true, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } });
  } catch (err) { await logWarn("Lỗi /chat/fix-continue", { error: err?.message || String(err) }); return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.post("/conversations", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const { projectId = null, title = null } = req.body || {};
    const convo = await createConversation({ userId, projectId, title });
    return res.json({ ok: true, conversation: { ...convo, id: String(convo._id) } });
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.get("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const { conversationId } = req.params;
    const convo = await getConversation(userId, conversationId);
    if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy hội thoại" });
    const raw = await listMessages(conversationId);
    const items = await Promise.all(raw.map(attachFilesToMessage));
    return res.json({ ok: true, items });
  } catch (err) { await logWarn("Lỗi get messages", { error: err?.message || String(err) }); return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.get("/conversations/recent", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const items = await listRecentConversations(userId, {});
    return res.json({ ok: true, items });
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.delete("/conversations/all", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const deleted = await deleteAllNonProjectConversations(userId);
    return res.json({ ok: true, deleted });
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const { conversationId } = req.params;
    const ok = await dbDeleteConversation(userId, conversationId);
    if (!ok) return res.status(404).json({ ok: false, message: "Không xóa được" });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.patch("/conversations/:conversationId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const { conversationId } = req.params;
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, message: "Thiếu title" });
    const convo = await getConversation(userId, conversationId);
    if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy" });
    const ok = await updateConversationTitle(conversationId, String(title));
    return res.json({ ok });
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

export default router;