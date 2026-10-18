// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS như ChatGPT.
// QUY TRÌNH 6 BƯỚC:
// 1. Test Sandbox (Lỗi cú pháp) -> 2. BOSS Review Logic (Không bịa lỗi) -> 3. Tổng hợp lỗi
// -> 4. BOSS Sửa -> 5. Test lại Sandbox -> 6. PASS mới trả về.

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
const BOSS_MAX_OUTPUT_TOKENS = 32768;
const BOSS_FIX_MAX_OUTPUT_TOKENS = 60000;
const MAX_FIX_ITERATIONS = 15; // Tối đa 15 vòng lặp để tránh treo server

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
  return null;
}

// ============================================================
// VÒNG LẶP 6 BƯỚC TỰ ĐỘNG (SỬA TỚI KHI SẠCH LỖI)
// ============================================================
async function runStrictFixLoop({ userId, conversationId, language, initialCode, currentVersion = 0, signal }) {
  let currentCode = initialCode;
  let iteration = 0;
  const startTime = Date.now();

  await logInfo("HỆ THỐNG: Bắt đầu quy trình 6 bước sửa lỗi", { userId, conversationId });

  while (iteration < MAX_FIX_ITERATIONS) {
    // Chống treo: Quá 10 phút thì dừng
    if (Date.now() - startTime > 10 * 60 * 1000) {
      return { ok: false, error: "Hết thời gian xử lý (quá 10 phút).", code: currentCode, language };
    }
    iteration++;

    // ===== BƯỚC 1: TEST SANDBOX =====
    const sandboxRes = await kiemTraSandbox({ userId, conversationId, language, code: currentCode, testCode: "", signal });
    const sandboxError = sandboxRes.ok ? "" : errString(sandboxRes.stderr || sandboxRes.error || "Lỗi Sandbox không rõ");

    // ===== BƯỚC 2: BOSS REVIEW LOGIC (KHÔNG BỊA LỖI) =====
    const reviewMessages = buildBossReviewMessages({ language, code: currentCode });
    const reviewRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: reviewMessages, temperature: 0.1, maxTokens: 4096, signal });
    
    let logicError = "";
    if (reviewRes.ok && reviewRes.text) {
      const text = reviewRes.text.trim();
      if (!text.includes("NO_LOGIC_ERROR")) {
        logicError = text;
      }
    }

    // ===== BƯỚC 6: KIỂM TRA NẾU SẠCH LỖI THÌ TRẢ VỀ =====
    if (!sandboxError && !logicError) {
      try { await saveArtifact({ userId, conversationId, language, code: currentCode, version: currentVersion + 1 }); } catch {}
      return { ok: true, code: currentCode, language, iterations: iteration };
    }

    await logInfo(`HỆ THỐNG: Vòng ${iteration} phát hiện lỗi`, { 
      sandboxError: sandboxError.slice(0, 100), 
      logicError: logicError.slice(0, 100) 
    });

    // ===== BƯỚC 3 & 4: TỔNG HỢP LỖI VÀ BOSS SỬA =====
    const fixMessages = buildBossFixCodeMessages({ sandboxError, logicError, failedCode: currentCode, language });
    const fixRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: fixMessages, temperature: 0.1, maxTokens: BOSS_FIX_MAX_OUTPUT_TOKENS, signal });

    if (!fixRes.ok || !fixRes.text) {
       continue; // BOSS lỗi API, thử lại vòng sau
    }

    const validation = validateCodeOutput(fixRes.text);
    if (validation.ok && validation.code) {
      // Chống kẹt: Nếu BOSS sửa mà code không đổi (bó tay)
      if (validation.code === currentCode) {
         return { ok: false, error: "BOSS không thể tìm ra cách sửa (code không thay đổi).", code: currentCode, language };
      }
      currentCode = validation.code;
      language = validation.language || language;
    } else {
       continue; // BOSS trả về sai định dạng, thử lại
    }
  }

  return { ok: false, error: `Đã thử sửa ${MAX_FIX_ITERATIONS} lần nhưng vẫn còn lỗi.`, code: currentCode, language };
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

  // 1. USER GỬI CODE -> KÍCH HOẠT QUY TRÌNH 6 BƯỚC LUÔN
  const extractedFromUser = extractCodeFromRequest(userRequest);
  if (extractedFromUser) {
    await logInfo("HỆ THỐNG: User gửi code -> Chạy quy trình 6 bước", { userId, conversationId });
    
    const fixResult = await runStrictFixLoop({ 
        userId, conversationId, language: extractedFromUser.language, 
        initialCode: extractedFromUser.code, currentVersion: (currentCode?.version || 0), signal 
    });

    if (fixResult.ok) {
      const msg = fixResult.iterations === 1 
        ? `✅ Code hoàn hảo. Không phát hiện lỗi cú pháp hay lỗi logic.` 
        : `✅ Đã phát hiện và sửa thành công các lỗi (qua ${fixResult.iterations} vòng kiểm tra).\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``;
      return { ok: true, text: msg, meta: { action: "strict-fixed" } };
    } else {
      return { ok: true, text: `⚠ Đã cố gắng sửa nhưng thất bại: ${fixResult.error}\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "strict-fail" } };
    }
  }

  // 2. USER BẢO SỬA CODE ĐANG CÓ
  const isShortFixCommand = /^(sửa đi|sửa lỗi|fix|fix đi|sửa|sửa code|sửa lại|sửa tiếp|làm đi|ok sửa|fix hết)$/i.test(userRequest.trim());
  if (currentCode && isShortFixCommand) {
    await logInfo("HỆ THỐNG: User yêu cầu sửa code -> Chạy quy trình 6 bước", { userId, conversationId });
    
    const fixResult = await runStrictFixLoop({ 
        userId, conversationId, language: currentCode.language, 
        initialCode: currentCode.code, currentVersion: currentCode.version, signal 
    });

    if (fixResult.ok) {
      return { ok: true, text: `✅ Đã sửa xong hoàn toàn.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "strict-fixed" } };
    } else {
      return { ok: true, text: `⚠ Đã cố gắng sửa nhưng thất bại: ${fixResult.error}`, meta: { action: "strict-fail" } };
    }
  }

  // 3. CHAT BÌNH THƯỜNG / TẠO CODE MỚI
  const bossMessages = buildBossMessages({ userRequest, history: historyCtx, currentCode });
  let bossRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: bossMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  if (!bossRes.ok) {
    bossRes = await goiBossMoi({ userId, conversationId, oldSession: null, messages: bossMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  }
  if (!bossRes.ok || !bossRes.text) return { ok: false, error: bossRes.error || "BOSS không trả lời được" };

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;
  let parsed = parseBossOutput(bossRes.text);

  if (parsed.type === "text") return { ok: true, text: parsed.text, meta: { action: "reply" } };

  if (parsed.type === "tool" && parsed.tool === "search_web") {
    const query = parsed.args?.query || userRequest;
    const web = await traWeb({ userId, conversationId, query, signal });
    const webContext = web.ok ? formatWebResults(web.results) : "";
    const finalMessages = buildBossAfterWebMessages({ userRequest, webContext, history: historyCtx });
    const finalRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: finalMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
    return { ok: true, text: finalRes.ok ? finalRes.text : `Không tra được web.`, meta: { action: "web" } };
  }

  // TẠO CODE MỚI BẰNG LÍNH -> SAU ĐÓ CHẠY QUY TRÌNH 6 BƯỚC ĐỂ ĐẢM BẢO SẠCH LỖI
  if (parsed.type === "tool" && parsed.tool === "delegate_soldier") {
    const args = parsed.args || {};
    const taskType = args.taskType || "bulk";
    const goal = args.goal || userRequest;
    const requestTokens = countTokens(userRequest);

    if (requestTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) return await runChunkedDelegate({ userId, conversationId, userRequest, bossSessionId, historyCtx, history, signal });

    const format = { taskType, goal, requirements: args.requirements || [], constraints: args.constraints || [], expectedOutput: args.expectedOutput || "", needCode: taskType === "code", currentCode: currentCode || null, isModify: false, subtasks: [], risks: [], qualityCriteria: [] };
    
    const giao = await giaoFormat({ userId, conversationId, bossSessionId, format, tokens: countTokens(userRequest) });
    if (!giao.ok) return { ok: false, error: giao.error };
    
    const soldierMessages = buildSoldierMessages({ format, history: history.slice(-HISTORY_FOR_BOSS), userRequest, currentCode });
    const linh = await goiLinh({ userId, taskId: giao.taskId, taskType: giao.taskType, messages: soldierMessages, payload: format, temperature: 0.3, maxTokens: 8192, signal });
    
    if (!linh.ok) return { ok: false, error: linh.error || "Lính không hoàn thành" };
    
    const validation = validateCodeOutput(linh.text);
    if (!validation.ok) return { ok: false, error: "Lính không trả về code hợp lệ." };

    // LÍNH VIẾT XONG -> BOSS CHECK LẠI BẰNG QUY TRÌNH 6 BƯỚC
    const fixResult = await runStrictFixLoop({ 
        userId, conversationId, language: validation.language, 
        initialCode: validation.code, currentVersion: (currentCode?.version || 0), signal 
    });

    if (fixResult.ok) {
      return { ok: true, text: `✅ Code đã hoàn thành và vượt qua toàn bộ kiểm thử.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "delegate-strict-pass" } };
    } else {
      return { ok: true, text: `⚠ Code đã tạo nhưng không thể sửa sạch lỗi: ${fixResult.error}`, meta: { action: "delegate-strict-fail" } };
    }
  }

  return { ok: true, text: parsed.text || bossRes.text, meta: { action: "reply-fallback" } };
}

// ============================================================
// PROMPT 1: BOSS REVIEW LOGIC (ÉP KHÔNG BỊA LỖI)
// ============================================================
function buildBossReviewMessages({ language, code }) {
  return [
    {
      role: "system",
      content:
        "Bạn là Chuyên gia Kiểm thử (QA) CỰC KỲ KHÓ TÍNH.\n" +
        "Nhiệm vụ: Đọc code và tìm LỖI LOGIC thực sự.\n" +
        "LUẬT THÉP:\n" +
        "1. TUYỆT ĐỐI KHÔNG BỊA LỖI.\n" +
        "2. Nếu có lỗi, phải trích xuất đúng đoạn code và mô tả KỊCH BẢN gây lỗi (VD: Nhập X thì ra Y sai).\n" +
        "3. NẾU KHÔNG CÓ LỖI LOGIC NÀO, BẮT BUỘC CHỈ TRẢ VỀ DUY NHẤT CHUỖI: NO_LOGIC_ERROR\n" +
        "ĐỪNG viết bất kỳ chữ nào khác nếu không có lỗi."
    },
    {
      role: "user",
      content: `Ngôn ngữ: ${language}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\``
    }
  ];
}

// ============================================================
// PROMPT 2: BOSS SỬA CODE (DỰA TRÊN TỔNG HỢP LỖI)
// ============================================================
function buildBossFixCodeMessages({ sandboxError, logicError, failedCode, language }) {
  let errorText = "";
  if (sandboxError) errorText += `- Lỗi cú pháp/runtime (từ Sandbox): ${sandboxError}\n`;
  if (logicError) errorText += `- Lỗi logic (từ QA): ${logicError}\n`;

  return [
    {
      role: "system",
      content:
        "Bạn là BOSS. Bạn phải sửa code dựa trên DANH SÁCH LỖI được cung cấp.\n" +
        "TUYỆT ĐỐI KHÔNG viết lại từ đầu. Chỉ sửa đúng những lỗi được liệt kê và trả về TOÀN BỘ CODE trong ```<ngôn ngữ>...```.\n" +
        "Sau khi sửa, code phải chạy được (không lỗi cú pháp) và giải quyết được các lỗi logic đã nêu."
    },
    {
      role: "user",
      content: [
        "DANH SÁCH LỖI CẦN SỬA:", errorText, "",
        "Code hiện tại:", "```" + language, failedCode, "```", "",
        "Hãy sửa và trả về TOÀN BỘ CODE."
      ].join("\n"),
    },
  ];
}

// ============================================================
// CÁC HÀM KHÁC (Giữ nguyên)
// ============================================================
function buildBossMessages({ userRequest, history = [], currentCode = null }) {
  const messages = [{ role: "system", content: "Bạn là Rồng Thần — BOSS. Nếu User muốn tạo web/app mới -> Gọi 'delegate_soldier'. Nếu chat bình thường -> Trả TEXT." }];
  for (const m of history) { if (!m.text || !m.text.trim()) continue; messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  if (currentCode) messages.push({ role: "user", content: `[NGỮ CẢNH]\nĐang có code:\n\`\`\`${currentCode.language}\n${currentCode.code}\n\`\`\`` });
  else messages.push({ role: "user", content: userRequest });
  return messages;
}

function buildBossAfterWebMessages({ userRequest, webContext, history = [] }) {
  const messages = [{ role: "system", content: "Bạn là Rồng Thần. Đọc dữ liệu web → trả lời User." }];
  for (const m of history) { if (!m.text || !m.text.trim()) continue; messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  messages.push({ role: "user", content: ["Yêu cầu:", userRequest, "", "Dữ liệu web:", webContext || "(không có)"].join("\n") });
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

function buildSoldierMessages({ format, history = [], userRequest, currentCode = null }) {
  const messages = [{ role: "system", content: "Bạn là lính. Viết code theo format BOSS giao. Trả về TOÀN BỘ CODE trong ```<lang>...```." }];
  for (const m of history) { if (!m.text || !m.text.trim()) continue; messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  const lines = ["YÊU CẦU GỐC:", userRequest, "", "FORMAT BOSS GIAO:", format.goal];
  if (format.constraints?.length) { lines.push("", "Ràng buộc:"); for (const c of format.constraints) lines.push(`- ${c}`); }
  if (currentCode?.code) lines.push("", `CODE HIỆN TẠI:`, "```" + (currentCode.language || "html"), currentCode.code, "```");
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
    codeChunks.push(validation.code);
    outputs.push(`[Phần ${i + 1}]\n\`\`\`${validation.language}\n${validation.code}\n\`\`\``);
  }
  let finalText = outputs.join("\n\n");
  if (codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);
    try { await saveArtifact({ userId, conversationId, language: lastLanguage, code: mergedCode, version: 1 }); } catch {}
    finalText = `✅ Code đã hoàn thành.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\``;
  }
  return { ok: true, text: finalText, meta: { action: "delegate-chunked", chunked: true, chunkCount: chunks.length } };
}

function mergeCodeChunks(codeChunks, language) {
  if (!Array.isArray(codeChunks) || codeChunks.length === 0) return "";
  if (language === "html") {
    let bodyContent = "", headContent = "";
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

// ROUTE
router.post("/send", (req, res, next) => { upload.array("attachments", 10)(req, res, (err) => { if (err) { return res.status(400).json({ ok: false, message: "Lỗi upload" }); } next(); }); }, async (req, res) => {
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
        } catch {}
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
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.post("/fix-continue", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    const conversationId = req.body?.conversationId;
    if (!conversationId) return res.status(400).json({ ok: false, message: "Thiếu conversationId" });
    const latest = await getLatestCodeArtifact(conversationId);
    if (!latest || !latest.code) return res.status(400).json({ ok: false, message: "Không có code để sửa." });

    const fixResult = await runStrictFixLoop({ userId, conversationId, language: latest.language || "html", initialCode: latest.code, currentVersion: (latest.version || 0), signal: null });
    
    const finalText = fixResult.ok 
      ? `✅ Đã sửa xong.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``
      : `⚠ Chưa sửa xong: ${fixResult.error}`;

    const delivered = await traKetQuaChoUser({ userId, conversationId, text: finalText, meta: { action: "resume-fixed" } });
    if (!delivered.ok) return res.status(500).json({ ok: false, message: delivered.error });
    return res.json({ ok: true, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } });
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

router.post("/conversations", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { projectId = null, title = null } = req.body || {}; const convo = await createConversation({ userId, projectId, title }); return res.json({ ok: true, conversation: { ...convo, id: String(convo._id) } }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.get("/conversations/:conversationId/messages", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const convo = await getConversation(userId, conversationId); if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy hội thoại" }); const raw = await listMessages(conversationId); const items = await Promise.all(raw.map(attachFilesToMessage)); return res.json({ ok: true, items }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.get("/conversations/recent", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const items = await listRecentConversations(userId, {}); return res.json({ ok: true, items }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.delete("/conversations/all", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const deleted = await deleteAllNonProjectConversations(userId); return res.json({ ok: true, deleted }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.delete("/conversations/:conversationId", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const ok = await dbDeleteConversation(userId, conversationId); if (!ok) return res.status(404).json({ ok: false, message: "Không xóa được" }); return res.json({ ok: true }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.patch("/conversations/:conversationId", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const { title } = req.body || {}; if (!title) return res.status(400).json({ ok: false, message: "Thiếu title" }); const convo = await getConversation(userId, conversationId); if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy" }); const ok = await updateConversationTitle(conversationId, String(title)); return res.json({ ok }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });

export default router;