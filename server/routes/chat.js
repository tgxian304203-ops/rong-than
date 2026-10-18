// server/routes/chat.js
// Nhiệm vụ: API chat — Hỗ trợ test code lẻ, nhớ dự án đa file, gọi đúng tên file.

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
const MAX_FIX_ITERATIONS = 5;

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

// Trích xuất code và Tên file (nếu có)
function extractCodeFromRequest(userRequest) {
  if (!userRequest || typeof userRequest !== "string") return null;
  
  // Tìm code block có kèm tên file (VD: ```html index.html)
  const blockMatch = userRequest.match(/```([a-zA-Z0-9+\-#.]*)(?:\s+([a-zA-Z0-9_\-.]+))?\n([\s\S]*?)```/);
  if (blockMatch) {
    const lang = (blockMatch[1] || "").toLowerCase().trim() || "html";
    const filename = (blockMatch[2] || "").trim() || `file_1.${lang}`;
    const code = (blockMatch[3] || "").trim();
    if (code) return { language: lang, filename, code };
  }
  
  const htmlDoctype = userRequest.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
  if (htmlDoctype) return { language: "html", filename: "index.html", code: htmlDoctype[1].trim() };
  
  return null;
}

// Tìm code của 1 file cụ thể trong dự án
function getFileFromProject(filesObj, filenameOrIndex) {
  if (!filesObj) return null;
  const keys = Object.keys(filesObj);
  
  // Tìm theo tên file (VD: "app.js")
  const nameMatch = keys.find(k => k.toLowerCase() === filenameOrIndex.toLowerCase());
  if (nameMatch) return { filename: nameMatch, code: filesObj[nameMatch] };
  
  // Tìm theo số thứ tự (VD: "file 2")
  const idxMatch = filenameOrIndex.match(/\d+/);
  if (idxMatch) {
    const idx = parseInt(idxMatch[0]) - 1;
    if (idx >= 0 && idx < keys.length) {
      return { filename: keys[idx], code: filesObj[keys[idx]] };
    }
  }
  return null;
}

// ============================================================
// VÒNG LẶP 6 BƯỚC TỰ ĐỘNG (SỬA TỚI KHI SẠCH LỖI)
// ============================================================
async function runStrictFixLoop({ userId, conversationId, language, initialCode, currentVersion = 0, signal }) {
  let currentCode = initialCode;
  let iteration = 0;

  while (iteration < MAX_FIX_ITERATIONS) {
    iteration++;

    const sandboxRes = await kiemTraSandbox({ userId, conversationId, language, code: currentCode, testCode: "", signal });
    const sandboxError = sandboxRes.ok ? "" : errString(sandboxRes.stderr || sandboxRes.error || "Lỗi Sandbox");

    const reviewMessages = buildBossReviewMessages({ language, code: currentCode });
    const reviewRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: reviewMessages, temperature: 0.1, maxTokens: 4096, signal });
    
    let logicError = "";
    if (reviewRes.ok && reviewRes.text) {
      const text = reviewRes.text.trim();
      if (!text.includes("NO_LOGIC_ERROR")) logicError = text;
    }

    if (!sandboxError && !logicError) return { ok: true, code: currentCode, language };

    const fixMessages = buildBossFixCodeMessages({ sandboxError, logicError, failedCode: currentCode, language });
    const fixRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: fixMessages, temperature: 0.1, maxTokens: BOSS_FIX_MAX_OUTPUT_TOKENS, signal });

    if (fixRes.ok && fixRes.text) {
      const validation = validateCodeOutput(fixRes.text);
      if (validation.ok) {
        if (validation.code === currentCode) return { ok: false, error: "BOSS bó tay." };
        currentCode = validation.code;
        language = validation.language || language;
      }
    }
  }
  return { ok: false, error: `Hết ${MAX_FIX_ITERATIONS} lần sửa.`, code: currentCode, language };
}

// ============================================================
// PIPELINE BOSS (QUẢN LÝ ĐA FILE)
// ============================================================
async function runBossPipeline({ userId, conversationId, userRequest, userLabel, signal }) {
  const recv = await bossNhanYeuCau({ userId, conversationId, userRequest, userLabel });
  if (!recv.ok) return { ok: false, error: recv.error };

  // 1. TẢI DỰ ÁN HIỆN TẠI (Virtual File System)
  let projectFiles = {};
  let currentVersion = 0;
  try {
    const artifact = await getLatestCodeArtifact(conversationId);
    if (artifact && artifact.files) {
      projectFiles = artifact.files;
      currentVersion = artifact.version || 1;
    }
  } catch {}

  const fileNames = Object.keys(projectFiles);

  // 2. NGƯỜI DÙNG GỬI CODE MỚI (Có thể là test lẻ hoặc thêm vào dự án)
  const extractedFromUser = extractCodeFromRequest(userRequest);
  if (extractedFromUser) {
    const isTestOnly = /test|kiểm tra/i.test(userRequest) && !/lưu|thêm|tạo file|sửa file/i.test(userRequest);
    
    // Chạy quy trình sửa lỗi cho đoạn code mới
    const fixResult = await runStrictFixLoop({ 
        userId, conversationId, language: extractedFromUser.language, 
        initialCode: extractedFromUser.code, currentVersion, signal 
    });

    if (isTestOnly) {
      // Chỉ test lẻ -> Trả kết quả, KHÔNG lưu vào dự án
      if (fixResult.ok) {
        return { ok: true, text: `✅ Test thành công! Code không có lỗi.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "test-pass" } };
      } else {
        return { ok: true, text: `⚠ Đã sửa nhưng còn lỗi: ${fixResult.error}\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "test-fail" } };
      }
    } else {
      // Lưu vào dự án (hoặc cập nhật file cũ)
      if (fixResult.ok) {
        projectFiles[extractedFromUser.filename] = fixResult.code;
        try { await saveArtifact({ userId, conversationId, files: projectFiles, version: currentVersion + 1 }); } catch {}
        return { ok: true, text: `✅ Đã lưu file \`${extractedFromUser.filename}\` vào dự án (đã sửa sạch lỗi).\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "save-pass" } };
      }
    }
  }

  // 3. NGƯỜI DÙNG YÊU CẦU SỬA MỘT FILE CỤ THỂ TRONG DỰ ÁN
  const fileQueryMatch = userRequest.match(/(sửa|fix|check|kiểm tra)\s+(file|lính)\s+(.+)/i);
  if (fileQueryMatch && fileNames.length > 0) {
    const query = fileQueryMatch[3].trim();
    const targetFile = getFileFromProject(projectFiles, query);

    if (!targetFile) {
      return { ok: true, text: `❌ Không tìm thấy file "${query}" trong dự án. Danh sách file hiện có:\n${fileNames.map((f, i) => `${i+1}. ${f}`).join("\n")}`, meta: { action: "file-not-found" } };
    }

    const lang = targetFile.filename.split('.').pop();
    const fixResult = await runStrictFixLoop({ 
        userId, conversationId, language: lang, 
        initialCode: targetFile.code, currentVersion, signal 
    });

    if (fixResult.ok) {
      projectFiles[targetFile.filename] = fixResult.code;
      try { await saveArtifact({ userId, conversationId, files: projectFiles, version: currentVersion + 1 }); } catch {}
      return { ok: true, text: `✅ Đã kiểm tra và sửa xong file \`${targetFile.filename}\`.\n\n\`\`\`${lang}\n${fixResult.code}\n\`\`\``, meta: { action: "file-fixed" } };
    } else {
      return { ok: true, text: `⚠ File \`${targetFile.filename}\` còn lỗi chưa sửa được: ${fixResult.error}`, meta: { action: "file-fail" } };
    }
  }

  // 4. NẾU USER HỎI DANH SÁCH FILE
  if (/danh sách file|list file|các file/i.test(userRequest) && fileNames.length > 0) {
     return { ok: true, text: `📁 Dự án hiện có ${fileNames.length} file:\n${fileNames.map((f, i) => `${i+1}. ${f}`).join("\n")}`, meta: { action: "list-files" } };
  }

  // 5. CHAT BÌNH THƯỜNG / TẠO CODE MỚI
  const history = await loadConversationHistory(conversationId, HISTORY_FOR_BOSS);
  const historyCtx = history.slice(0, -1);
  
  const bossMessages = buildBossMessages({ userRequest, history: historyCtx, fileNames });
  let bossRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: bossMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  if (!bossRes.ok) {
    bossRes = await goiBossMoi({ userId, conversationId, oldSession: null, messages: bossMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  }
  if (!bossRes.ok || !bossRes.text) return { ok: false, error: bossRes.error || "BOSS không trả lời được" };

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;
  let parsed = parseBossOutput(bossRes.text);

  if (parsed.type === "text") return { ok: true, text: parsed.text, meta: { action: "reply" } };

  // TẠO CODE MỚI (Gọi Lính)
  if (parsed.type === "tool" && parsed.tool === "delegate_soldier") {
    const args = parsed.args || {};
    const taskType = args.taskType || "bulk";
    const goal = args.goal || userRequest;

    const format = { taskType, goal, requirements: args.requirements || [], constraints: args.constraints || [], expectedOutput: args.expectedOutput || "", needCode: taskType === "code", currentCode: null, isModify: false, subtasks: [], risks: [], qualityCriteria: [] };
    
    const giao = await giaoFormat({ userId, conversationId, bossSessionId, format, tokens: countTokens(userRequest) });
    if (!giao.ok) return { ok: false, error: giao.error };
    
    const soldierMessages = buildSoldierMessages({ format, history: history.slice(-HISTORY_FOR_BOSS), userRequest });
    const linh = await goiLinh({ userId, taskId: giao.taskId, taskType: giao.taskType, messages: soldierMessages, payload: format, temperature: 0.3, maxTokens: 8192, signal });
    
    if (!linh.ok) return { ok: false, error: linh.error || "Lính không hoàn thành" };
    
    const validation = validateCodeOutput(linh.text);
    if (!validation.ok) return { ok: false, error: "Lính không trả về code hợp lệ." };

    const fixResult = await runStrictFixLoop({ 
        userId, conversationId, language: validation.language, 
        initialCode: validation.code, currentVersion, signal 
    });

    if (fixResult.ok) {
      projectFiles[`new_file.${validation.language}`] = fixResult.code;
      try { await saveArtifact({ userId, conversationId, files: projectFiles, version: currentVersion + 1 }); } catch {}
      return { ok: true, text: `✅ Đã tạo code mới và lưu vào dự án.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "delegate-pass" } };
    }
  }

  return { ok: true, text: parsed.text || bossRes.text, meta: { action: "reply-fallback" } };
}

// CÁC HÀM PROMPT (Giữ nguyên)
function buildBossReviewMessages({ language, code }) {
  return [
    { role: "system", content: "Bạn là Chuyên gia Kiểm thử (QA). Tìm LỖI LOGIC thực sự. Nếu không có lỗi, CHỈ trả về: NO_LOGIC_ERROR. Cấm bịa lỗi." },
    { role: "user", content: `Ngôn ngữ: ${language}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\`` }
  ];
}

function buildBossFixCodeMessages({ sandboxError, logicError, failedCode, language }) {
  let errorText = "";
  if (sandboxError) errorText += `- Lỗi cú pháp: ${sandboxError}\n`;
  if (logicError) errorText += `- Lỗi logic: ${logicError}\n`;

  return [
    { role: "system", content: "Bạn là BOSS. Sửa code dựa trên lỗi. Trả về TOÀN BỘ CODE trong ```<lang>...```." },
    { role: "user", content: `DANH SÁCH LỖI:\n${errorText}\n\nCode:\n\`\`\`${language}\n${failedCode}\n\`\`\`` }
  ];
}

function buildBossMessages({ userRequest, history = [], fileNames = [] }) {
  const messages = [
    { role: "system", content: `Bạn là Rồng Thần — BOSS. Dự án hiện có các file: ${fileNames.join(", ") || "Chưa có file nào"}. Nếu User muốn tạo code mới -> Gọi 'delegate_soldier'.` }
  ];
  for (const m of history) { if (!m.text || !m.text.trim()) continue; messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  messages.push({ role: "user", content: userRequest });
  return messages;
}

function parseBossOutput(text) {
  if (!text || typeof text !== "string") return { type: "text", text: "(Không có nội dung)" };
  let s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { const obj = JSON.parse(s.slice(start, end + 1)); if (obj.tool) return { type: "tool", tool: obj.tool, args: obj.args || {} }; } catch {}
  }
  return { type: "text", text: s };
}

function buildSoldierMessages({ format, history = [], userRequest }) {
  const messages = [{ role: "system", content: "Bạn là lính. Viết code theo format BOSS giao. Trả về TOÀN BỘ CODE trong ```<lang>...```." }];
  for (const m of history) { if (!m.text || !m.text.trim()) continue; messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  messages.push({ role: "user", content: `YÊU CẦU: ${userRequest}\nFORMAT: ${format.goal}` });
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
    if (block.lang === "html" || block.lang === "htm") { if (isRealHtml(body)) return { ok: true, code: body, language: "html" }; continue; }
    if (block.lang === "javascript" || block.lang === "js") { if (isRealJavaScript(body)) return { ok: true, code: body, language: "javascript" }; continue; }
    if (block.lang === "python" || block.lang === "py") { if (isRealPython(body)) return { ok: true, code: body, language: "python" }; continue; }
  }
  return { ok: false, reason: "Code block không hợp lệ" };
}

function isRealHtml(body) { let count = 0; if (/<html[\s>]/i.test(body)) count++; if (/<head[\s>]/i.test(body)) count++; if (/<body[\s>]/i.test(body)) count++; if (/<div[\s>]/i.test(body)) count++; if (/<p[\s>]/i.test(body)) count++; if (/<script[\s>]/i.test(body)) count++; if (/<h[1-6][\s>]/i.test(body)) count++; return count >= 2; }
function isRealJavaScript(body) { return /(function\s+|const\s+|let\s+|var\s+|=>|class\s+|import\s+|export\s+)/i.test(body); }
function isRealPython(body) { return /(def\s+|class\s+|import\s+|from\s+|print\s*\()/i.test(body); }

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
          let dataUrl = "";
          if (isImage && f.size <= MAX_IMAGE_BYTES) dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
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
    if (!latest || !latest.files) return res.status(400).json({ ok: false, message: "Không có dự án để sửa." });

    const projectFiles = latest.files;
    const currentVersion = latest.version || 1;
    const fileNames = Object.keys(projectFiles);
    if (fileNames.length === 0) return res.status(400).json({ ok: false, message: "Dự án rỗng." });

    // Lấy file đầu tiên cần sửa
    const targetFile = fileNames[0];
    const lang = targetFile.split('.').pop();
    
    const fixResult = await runStrictFixLoop({ userId, conversationId, language: lang, initialCode: projectFiles[targetFile], currentVersion, signal: null });
    
    if (fixResult.ok) {
      projectFiles[targetFile] = fixResult.code;
      try { await saveArtifact({ userId, conversationId, files: projectFiles, version: currentVersion + 1 }); } catch {}
      const finalText = `✅ Đã sửa xong file \`${targetFile}\`.\n\n\`\`\`${lang}\n${fixResult.code}\n\`\`\``;
      const delivered = await traKetQuaChoUser({ userId, conversationId, text: finalText, meta: { action: "resume-fixed" } });
      return res.json({ ok: true, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } });
    } else {
      const delivered = await traKetQuaChoUser({ userId, conversationId, text: `⚠ Còn lỗi: ${fixResult.error}`, meta: { action: "resume-fail" } });
      return res.json({ ok: true, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } });
    }
  } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); }
});

// Các route khác giữ nguyên
router.post("/conversations", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { projectId = null, title = null } = req.body || {}; const convo = await createConversation({ userId, projectId, title }); return res.json({ ok: true, conversation: { ...convo, id: String(convo._id) } }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.get("/conversations/:conversationId/messages", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const convo = await getConversation(userId, conversationId); if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy hội thoại" }); const raw = await listMessages(conversationId); const items = await Promise.all(raw.map(attachFilesToMessage)); return res.json({ ok: true, items }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.get("/conversations/recent", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const items = await listRecentConversations(userId, {}); return res.json({ ok: true, items }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.delete("/conversations/all", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const deleted = await deleteAllNonProjectConversations(userId); return res.json({ ok: true, deleted }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.delete("/conversations/:conversationId", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const ok = await dbDeleteConversation(userId, conversationId); if (!ok) return res.status(404).json({ ok: false, message: "Không xóa được" }); return res.json({ ok: true }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.patch("/conversations/:conversationId", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const { title } = req.body || {}; if (!title) return res.status(400).json({ ok: false, message: "Thiếu title" }); const convo = await getConversation(userId, conversationId); if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy" }); const ok = await updateConversationTitle(conversationId, String(title)); return res.json({ ok }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });

export default router;