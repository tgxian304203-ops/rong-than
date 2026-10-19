// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS như ChatGPT. (Tối ưu Database đa file + Prompt)

import express from "express";
import multer from "multer";

import {
  createConversation, listRecentConversations, getConversation,
  deleteConversation as dbDeleteConversation, deleteAllNonProjectConversations, updateConversationTitle,
} from "../db/conversations.js";
import { listMessages, listRecentMessages } from "../db/messages.js";
import { saveAttachment, listByMessage as listAttachmentsByMessage } from "../db/attachments.js";
import { getLatestAny as getLatestCodeArtifact, saveArtifact } from "../db/codeArtifacts.js";
import { getAllFiles, upsertFile } from "../db/projectFiles.js"; // IMPORT MỚI

import { nhanYeuCau as gwNhanYeuCau } from "../gateway/nhan-yeu-cau.js";
import { chuyenYeuCauChoBoss } from "../gateway/chuyen-yeu-cau-cho-boss.js";
import { nhanKetQuaTuBoss } from "../gateway/nhan-ket-qua-tu-boss.js";
import { traKetQuaChoUser } from "../gateway/tra-ket-qua-cho-user.js";

import { nhanYeuCau as bossNhanYeuCau } from "../boss/nhan-yeu-cau.js";
import { traWeb, formatWebResults } from "../boss/tra-web.js";
import { giaoFormat } from "../boss/giao-format.js";

import { goiBoss } from "../dai-nao/goi-boss.js";
import { goiBossMoi } from "../dai-nao/goi-boss-moi.js";

import { goiLinh } from "../tieu-nao/goi-linh.js";
import { chunkText } from "../utils/chunker.js";
import { countTokens } from "../utils/token-counter.js";

import { LIMITS } from "../config/limits.js";

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const HISTORY_FOR_BOSS = 500;
const BOSS_MAX_OUTPUT_TOKENS = 32768;
const BOSS_FIX_MAX_OUTPUT_TOKENS = 60000;
const MAX_FIX_ITERATIONS = 5;

const BOSS_TOOLS = [
  {
    name: "search_web",
    description: "Tra cứu internet để lấy thông tin thời gian thực (tin tức, giá cả, thời tiết, sự kiện).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "delegate_soldier",
    description: "Giao việc cho Lính để viết code mới hoặc sửa code hiện tại.",
    parameters: {
      type: "object",
      properties: {
        taskType: { type: "string", enum: ["code", "fix-code", "bulk"] },
        goal: { type: "string" },
        requirements: { type: "array", items: { type: "string" } }
      },
      required: ["taskType", "goal"]
    }
  }
];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.MAX_UPLOAD_BYTES, files: LIMITS.MAX_ATTACHMENTS_PER_MESSAGE } });

function getUserId(req) { return req.headers["x-user-id"] ? String(req.headers["x-user-id"]) : null; }

async function attachFilesToMessage(msg) {
  if (!msg) return msg;
  try {
    const atts = await listAttachmentsByMessage(String(msg._id));
    const mapped = atts.map((a) => ({ id: String(a._id), name: a.name, type: a.type, size: a.size, url: a.url || "", dataUrl: a.dataUrl || "" }));
    return { ...msg, id: String(msg._id), attachments: mapped };
  } catch { return { ...msg, id: String(msg._id), attachments: [] }; }
}

async function loadConversationHistory(conversationId, limit) {
  try { return await listRecentMessages(conversationId, limit); } catch { return []; }
}

function errString(e) { return typeof e === "string" ? e : (e?.message || String(e)); }

function extractCodeFromRequest(userRequest) {
  if (!userRequest || typeof userRequest !== "string") return null;
  const blockMatch = userRequest.match(/```([a-zA-Z0-9+\-#.]*)(?:\s+([a-zA-Z0-9_\-.]+))?\n([\s\S]*?)```/);
  if (blockMatch) {
    const lang = (blockMatch[1] || "").toLowerCase().trim() || "html";
    const explicitName = (blockMatch[2] || "").trim();
    const code = (blockMatch[3] || "").trim();
    if (code) return { language: lang, filename: explicitName || `temp_code.${lang}`, hasExplicitName: !!explicitName, code };
  }
  const htmlDoctype = userRequest.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
  if (htmlDoctype) return { language: "html", filename: "temp_code.html", hasExplicitName: false, code: htmlDoctype[1].trim() };
  return null;
}

function getFileFromProject(filesObj, filenameOrIndex) {
  if (!filesObj) return null;
  const keys = Object.keys(filesObj);
  const nameMatch = keys.find(k => k.toLowerCase() === filenameOrIndex.toLowerCase());
  if (nameMatch) return { filename: nameMatch, code: filesObj[nameMatch] };
  const idxMatch = filenameOrIndex.match(/\d+/);
  if (idxMatch) {
    const idx = parseInt(idxMatch[0]) - 1;
    if (idx >= 0 && idx < keys.length) return { filename: keys[idx], code: filesObj[keys[idx]] };
  }
  return null;
}

async function runStrictFixLoop({ userId, conversationId, language, initialCode, currentVersion = 0, signal }) {
  let currentCode = initialCode;
  let iteration = 0;
  let noChangeCount = 0;

  while (iteration < MAX_FIX_ITERATIONS) {
    iteration++;
    const reviewRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: buildBossReviewMessages({ language, code: currentCode }), temperature: 0.1, maxTokens: 4096, signal });
    let logicError = "";
    if (reviewRes.ok && reviewRes.text && !reviewRes.text.includes("NO_LOGIC_ERROR")) logicError = reviewRes.text;

    if (!logicError) return { ok: true, code: currentCode, language };

    let finalLogicError = logicError;
    if (noChangeCount > 0) finalLogicError += `\n\n[HỆ THỐNG CẢNH BÁO]: Lần trước bạn KHÔNG HỀ SỬA GÌ. Lần này BẮT BUỘC phải sửa!`;

    const fixRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: buildBossFixCodeMessages({ logicError: finalLogicError, failedCode: currentCode, language }), temperature: 0.1, maxTokens: BOSS_FIX_MAX_OUTPUT_TOKENS, signal });

    if (fixRes.ok && fixRes.text) {
      const validation = validateCodeOutput(fixRes.text);
      if (validation.ok) {
        if (validation.code === currentCode) {
          noChangeCount++;
          if (noChangeCount >= 3) return { ok: false, error: "BOSS đã 3 lần không chịu sửa code.", code: currentCode, language };
          continue; 
        }
        noChangeCount = 0;
        currentCode = validation.code;
        language = validation.language || language;
      }
    }
  }
  return { ok: false, error: `Đã thử sửa ${MAX_FIX_ITERATIONS} lần nhưng vẫn còn lỗi.`, code: currentCode, language };
}

async function runBossPipeline({ userId, conversationId, userRequest, userLabel, signal }) {
  const recv = await bossNhanYeuCau({ userId, conversationId, userRequest, userLabel });
  if (!recv.ok) return { ok: false, error: recv.error };

  let projectFiles = {};
  let currentVersion = 0;
  try {
    const artifact = await getLatestCodeArtifact(conversationId);
    currentVersion = artifact?.version || 1;
    projectFiles = await getAllFiles({ conversationId }); // LẤY TỪ BẢNG MỚI
  } catch {}

  const fileNames = Object.keys(projectFiles);
  const extractedFromUser = extractCodeFromRequest(userRequest);

  // 1. USER GỬI CODE
  if (extractedFromUser) {
    const reviewRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: buildBossReviewMessages({ language: extractedFromUser.language, code: extractedFromUser.code }), temperature: 0.1, maxTokens: 4096, signal });
    let logicError = "";
    if (reviewRes.ok && reviewRes.text && !reviewRes.text.includes("NO_LOGIC_ERROR")) logicError = reviewRes.text;
    const hasError = !!logicError;

    if (extractedFromUser.hasExplicitName) {
      projectFiles[extractedFromUser.filename] = extractedFromUser.code;
      try { 
        await upsertFile({ userId, conversationId, filename: extractedFromUser.filename, content: extractedFromUser.code, language: extractedFromUser.language });
        await saveArtifact({ userId, conversationId, files: {}, version: currentVersion + 1 }); 
      } catch {}
      if (hasError) return { ok: true, text: `✅ Đã lưu file \`${extractedFromUser.filename}\`.\n⚠ File này có thể còn lỗi. Bạn có muốn tôi sửa không?`, meta: { action: "save-with-error" } };
      return { ok: true, text: `✅ Đã lưu file \`${extractedFromUser.filename}\` thành công.`, meta: { action: "save-pass" } };
    } else {
      projectFiles[extractedFromUser.filename] = extractedFromUser.code;
      try { 
        await upsertFile({ userId, conversationId, filename: extractedFromUser.filename, content: extractedFromUser.code, language: extractedFromUser.language });
        await saveArtifact({ userId, conversationId, files: {}, version: currentVersion + 1 }); 
      } catch {}
      if (!hasError) return { ok: true, text: `✅ Code hoàn toàn chính xác.`, meta: { action: "test-pass" } };
      return { ok: true, text: `Tôi phát hiện vấn đề:\n\n🧠 **Lỗi:**\n${logicError}\n\nBạn có muốn tôi sửa không?`, meta: { action: "test-fail" } };
    }
  }

  // 2. LỆNH "SỬA ĐI"
  if (/^(sửa đi|sửa lỗi|fix|fix đi|sửa|sửa code|sửa lại|sửa tiếp|làm đi|ok sửa|fix hết|đồng ý)$/i.test(userRequest.trim()) && fileNames.length > 0) {
    const latestFile = fileNames.find(f => f.startsWith("temp_code")) || fileNames[0];
    const lang = latestFile.split('.').pop();
    const fixResult = await runStrictFixLoop({ userId, conversationId, language: lang, initialCode: projectFiles[latestFile], currentVersion, signal });
    if (fixResult.ok) {
      projectFiles[latestFile] = fixResult.code;
      try { 
        await upsertFile({ userId, conversationId, filename: latestFile, content: fixResult.code, language: lang });
        await saveArtifact({ userId, conversationId, files: {}, version: currentVersion + 1 }); 
      } catch {}
      return { ok: true, text: `✅ Đã sửa xong hoàn toàn.\n\n\`\`\`${lang}\n${fixResult.code}\n\`\`\``, meta: { action: "fixed" } };
    } else return { ok: true, text: `⚠ Đã cố gắng sửa nhưng thất bại: ${fixResult.error}`, meta: { action: "fix-fail" } };
  }

  // 3. SỬA FILE CỤ THỂ
  const fileQueryMatch = userRequest.match(/(sửa|fix|check|kiểm tra)\s+(file|lính)\s+(.+)/i);
  if (fileQueryMatch && fileNames.length > 0) {
    const query = fileQueryMatch[3].trim();
    const targetFile = getFileFromProject(projectFiles, query);
    if (!targetFile) return { ok: true, text: `❌ Không tìm thấy file "${query}". Các file hiện có:\n${fileNames.join("\n")}`, meta: { action: "file-not-found" } };
    const lang = targetFile.filename.split('.').pop();
    const fixResult = await runStrictFixLoop({ userId, conversationId, language: lang, initialCode: targetFile.code, currentVersion, signal });
    if (fixResult.ok) {
      projectFiles[targetFile.filename] = fixResult.code;
      try { 
        await upsertFile({ userId, conversationId, filename: targetFile.filename, content: fixResult.code, language: lang });
        await saveArtifact({ userId, conversationId, files: {}, version: currentVersion + 1 }); 
      } catch {}
      const statusMsg = fixResult.code !== targetFile.code ? `✅ Đã sửa xong file \`${targetFile.filename}\`.` : `✅ File \`${targetFile.filename}\` không có lỗi.`;
      return { ok: true, text: `${statusMsg}\n\n\`\`\`${lang}\n${fixResult.code}\n\`\`\``, meta: { action: "file-fixed" } };
    } else return { ok: true, text: `⚠ File \`${targetFile.filename}\` còn lỗi: ${fixResult.error}`, meta: { action: "file-fail" } };
  }

  // 4. HỎI DANH SÁCH FILE
  if (/danh sách file|list file|các file/i.test(userRequest) && fileNames.length > 0) {
     return { ok: true, text: `📁 Dự án hiện có ${fileNames.length} file:\n${fileNames.map((f, i) => `${i+1}. ${f}`).join("\n")}`, meta: { action: "list-files" } };
  }

  // 5. CHAT BÌNH THƯỜNG / TẠO CODE MỚI
  const history = await loadConversationHistory(conversationId, HISTORY_FOR_BOSS);
  const historyCtx = history.slice(0, -1);
  // Nếu dự án có nhiều file, chỉ gửi file đầu tiên (hoặc file user yêu cầu) để tránh quá tải token
  const currentCode = fileNames.length > 0 ? projectFiles[fileNames[0]] : null;

  const bossMessages = buildBossMessages({ userRequest, history: historyCtx, fileNames, currentCode });
  
  let bossRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: bossMessages, tools: BOSS_TOOLS, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  if (!bossRes.ok) bossRes = await goiBossMoi({ userId, conversationId, oldSession: null, messages: bossMessages, tools: BOSS_TOOLS, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
  if (!bossRes.ok) return { ok: false, error: bossRes.error || "BOSS không trả lời được" };

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;

  if (bossRes.toolCalls && bossRes.toolCalls.length > 0) {
    const toolCall = bossRes.toolCalls[0];
    const args = toolCall.args || {};

    if (toolCall.name === "search_web") {
      let query = args.query || userRequest;
      const currentYear = new Date().getFullYear();
      if (!/\b20\d{2}\b/.test(query)) query = `${query} ${currentYear}`;
      const web = await traWeb({ userId, conversationId, query, signal });
      const webContext = web.ok ? formatWebResults(web.results) : "";
      const finalMessages = buildBossAfterWebMessages({ userRequest, webContext, history: historyCtx });
      const finalRes = await goiBoss({ userId, conversationId, taskType: "call-boss", messages: finalMessages, temperature: 0.6, maxTokens: BOSS_MAX_OUTPUT_TOKENS, signal });
      return { ok: true, text: finalRes.ok ? finalRes.text : `Không tra được web.`, meta: { action: "web" } };
    }

    if (toolCall.name === "delegate_soldier") {
      const taskType = args.taskType || "bulk";
      const goal = args.goal || userRequest;
      const requestTokens = countTokens(userRequest);

      if (requestTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) return await runChunkedDelegate({ userId, conversationId, userRequest, bossSessionId, historyCtx, history, signal });

      const format = { taskType, goal, requirements: args.requirements || [], constraints: [], expectedOutput: "", needCode: taskType === "code", currentCode: null, isModify: false, subtasks: [], risks: [], qualityCriteria: [] };
      const giao = await giaoFormat({ userId, conversationId, bossSessionId, format, tokens: countTokens(userRequest) });
      if (!giao.ok) return { ok: false, error: giao.error };
      
      const soldierMessages = buildSoldierMessages({ format, history: history.slice(-HISTORY_FOR_BOSS), userRequest });
      const linh = await goiLinh({ userId, taskId: giao.taskId, taskType: giao.taskType, messages: soldierMessages, payload: format, temperature: 0.3, maxTokens: 8192, signal });
      if (!linh.ok) return { ok: false, error: linh.error || "Lính không hoàn thành" };
      
      const validation = validateCodeOutput(linh.text);
      if (!validation.ok) return { ok: false, error: "Lính không trả về code hợp lệ." };

      const fixResult = await runStrictFixLoop({ userId, conversationId, language: validation.language, initialCode: validation.code, currentVersion, signal });

      if (fixResult.ok) {
        const newFilename = `new_code.${validation.language}`;
        projectFiles[newFilename] = fixResult.code;
        try { 
          await upsertFile({ userId, conversationId, filename: newFilename, content: fixResult.code, language: validation.language });
          await saveArtifact({ userId, conversationId, files: {}, version: currentVersion + 1 }); 
        } catch {}
        return { ok: true, text: `✅ Đã tạo code mới và lưu vào dự án.\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "delegate-pass" } };
      } else return { ok: true, text: `⚠ Lính đã tạo code nhưng sửa ${MAX_FIX_ITERATIONS} lần vẫn lỗi:\n\n\`\`\`${fixResult.language}\n${fixResult.code}\n\`\`\``, meta: { action: "delegate-fail" } };
    }
  }

  return { ok: true, text: bossRes.text || "(Không có phản hồi)", meta: { action: "reply" } };
}

// ============================================================
// PROMPT (Hướng 3: Tối ưu cho dự án đa file)
// ============================================================
function buildBossReviewMessages({ language, code }) {
  return [
    { role: "system", content: "Bạn là Chuyên gia Kiểm thử (QA). Tìm CẢ lỗi cú pháp VÀ lỗi logic. Nếu không có lỗi, CHỈ trả về: NO_LOGIC_ERROR. Cấm bịa lỗi. Nếu có lỗi, chỉ rõ dòng và cách sửa." },
    { role: "user", content: `Ngôn ngữ: ${language}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\`` }
  ];
}

function buildBossFixCodeMessages({ logicError, failedCode, language }) {
  let errorText = `🧠 **Lỗi:**\n${logicError}\n\n`;
  return [
    { role: "system", content: "Bạn là BOSS. Sửa TẤT CẢ các lỗi được cung cấp. KHÔNG viết lại từ đầu. Trả về TOÀN BỘ CODE trong ```<ngôn ngữ>...```." },
    { role: "user", content: ["DANH SÁCH LỖI CẦN SỬA:", errorText, "", "Code hiện tại:", "```" + language, failedCode, "```", "", "Hãy sửa TẤT CẢ và trả về TOÀN BỘ CODE."].join("\n") },
  ];
}

function buildBossMessages({ userRequest, history = [], fileNames = [], currentCode = null }) {
  const today = new Date().toLocaleDateString("vi-VN");
  let systemPrompt = `Bạn là Rồng Thần — BOSS. Hôm nay: ${today}.\n`;
  
  if (fileNames.length > 0) {
    systemPrompt += `Dự án hiện tại có ${fileNames.length} file: ${fileNames.join(", ")}.\n\n`;
  } else {
    systemPrompt += `Dự án chưa có file nào.\n\n`;
  }

  if (currentCode) {
    systemPrompt += `DƯỚI ĐÂY LÀ NỘI DUNG FILE ĐẦU TIÊN (Hãy đọc để hiểu ngữ cảnh):\n\`\`\`\n${String(currentCode).slice(0, 3000)}\n\`\`\`\n\n`;
  }
  
  systemPrompt += `QUY TẮC:\n- Trả lời tự nhiên.\n- Nếu user muốn tạo/sửa code -> Gọi tool "delegate_soldier".\n- Nếu cần tra cứu thông tin -> Gọi tool "search_web".\n- KHÔNG dùng bảng Markdown (|...|).`;

  const messages = [{ role: "system", content: systemPrompt }];
  for (const m of history) { if (m.text && m.text.trim()) messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  messages.push({ role: "user", content: userRequest });
  return messages;
}

function buildBossAfterWebMessages({ userRequest, webContext, history = [] }) {
  const today = new Date().toLocaleDateString("vi-VN");
  const messages = [{ role: "system", content: `Hôm nay là ${today}. Bạn là Rồng Thần. Đọc dữ liệu web → trả lời User. Ưu tiên dữ liệu mới nhất. KHÔNG dùng bảng Markdown (|...|).` }];
  for (const m of history) { if (m.text && m.text.trim()) messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  messages.push({ role: "user", content: ["Yêu cầu:", userRequest, "", "Dữ liệu web:", webContext || "(không có)"].join("\n") });
  return messages;
}

function buildSoldierMessages({ format, history = [], userRequest }) {
  let systemPrompt = `Bạn là Lính — lập trình viên AI. Viết code hoặc văn bản theo yêu cầu.\nQUY TẮC:\n1. KHÔNG giải thích dông dài.\n2. Code bọc trong \`\`\`<ngôn ngữ>\n...\n\`\`\`\n3. HTML/Web phải có <!DOCTYPE html>, <html>, <head>, <body>.\n4. KHÔNG dùng CDN ngoài trừ khi yêu cầu. KHÔNG viết shell.\n5. KHÔNG dùng bảng Markdown (|...|).`;
  const messages = [{ role: "system", content: systemPrompt }];
  for (const m of history.slice(-10)) { if (m.text && m.text.trim()) messages.push({ role: m.role === "ai" ? "assistant" : "user", content: m.text }); }
  
  let taskPrompt = `YÊU CẦU GỐC:\n${userRequest}\n\nCHỈ THỊ TỪ BOSS:\n- Mục tiêu: ${format.goal}\n`;
  if (format.isModify) taskPrompt += `- LƯU Ý: ĐÂY LÀ SỬA CODE. KHÔNG viết lại từ đầu.\n`;
  if (format.requirements?.length > 0) taskPrompt += `- Yêu cầu cụ thể:\n${format.requirements.map(r => `  + ${r}`).join('\n')}\n`;
  if (format.constraints?.length > 0) taskPrompt += `- Ràng buộc:\n${format.constraints.map(c => `  + ${c}`).join('\n')}\n`;
  if (format.expectedOutput) taskPrompt += `- Kết quả mong đợi: ${format.expectedOutput}\n`;

  messages.push({ role: "user", content: taskPrompt + `\nHãy viết code hoàn chỉnh và trả về duy nhất trong khối \`\`\`<ngôn ngữ>...\`\`\`.` });
  return messages;
}

function validateCodeOutput(text) {
  if (!text || typeof text !== "string") return { ok: false, reason: "Không có nội dung" };
  const codeBlocks = [];
  const re = /```([a-zA-Z0-9+\-#.]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(text)) !== null) codeBlocks.push({ lang: (match[1] || "").toLowerCase().trim(), body: match[2] || "" });
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

async function runChunkedDelegate({ userId, conversationId, userRequest, bossSessionId, historyCtx, history, signal }) {
  const chunks = chunkText(userRequest);
  const outputs = []; const codeChunks = []; let lastLanguage = "html";
  for (let i = 0; i < chunks.length; i++) {
    const chunkReq = `[PHẦN ${i + 1}/${chunks.length}]\n${chunks[i]}`;
    const format = { taskType: "code", goal: `Hoàn thành phần ${i + 1}/${chunks.length}`, needCode: true, requirements: [], constraints: [], expectedOutput: "", subtasks: [], risks: [], qualityCriteria: [] };
    const giao = await giaoFormat({ userId, conversationId, bossSessionId, format, tokens: countTokens(chunkReq) });
    if (!giao.ok) continue;
    const soldierMessages = buildSoldierMessages({ format, history: [], userRequest: chunkReq });
    const linh = await goiLinh({ userId, taskId: giao.taskId, taskType: giao.taskType, messages: soldierMessages, payload: format, temperature: 0.3, maxTokens: 8192, signal });
    if (!linh.ok) continue;
    const validation = validateCodeOutput(linh.text || "");
    if (!validation.ok) { outputs.push(`[Phần ${i + 1}]\n${linh.text || ""}`); continue; }
    codeChunks.push(validation.code); outputs.push(`[Phần ${i + 1}]\n\`\`\`${validation.language}\n${validation.code}\n\`\`\``);
  }
  let finalText = outputs.join("\n\n");
  if (codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);
    const finalFilename = `index.${lastLanguage}`;
    try { 
      await upsertFile({ userId, conversationId, filename: finalFilename, content: mergedCode, language: lastLanguage });
      await saveArtifact({ userId, conversationId, files: {}, version: 1 }); 
    } catch {}
    finalText = `✅ Code đã hoàn thành.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\``;
  }
  return { ok: true, text: finalText, meta: { action: "delegate-chunked", chunked: true, chunkCount: chunks.length } };
}

function mergeCodeChunks(codeChunks, language) {
  if (!Array.isArray(codeChunks) || codeChunks.length === 0) return "";
  if (language === "html") {
    let bodyContent = "", headContent = "";
    for (const chunk of codeChunks) {
      const headMatch = chunk.match(/<head[^>]*>([\s\S]*?)<\/head>/i); if (headMatch) headContent += "\n" + headMatch[1];
      const bodyMatch = chunk.match(/<body[^>]*>([\s\S]*?)<\/body>/i); if (bodyMatch) bodyContent += "\n" + bodyMatch[1]; else bodyContent += "\n" + chunk;
    }
    return `<!DOCTYPE html>\n<html lang="vi">\n<head>\n${headContent}\n</head>\n<body>\n${bodyContent}\n</body>\n</html>`;
  }
  return codeChunks.join("\n\n");
}

router.post("/send", (req, res, next) => { upload.array("attachments", 10)(req, res, (err) => { if (err) return res.status(400).json({ ok: false, message: "Lỗi upload" }); next(); }); }, async (req, res) => {
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
          let dataUrl = ""; if (isImage && f.size <= MAX_IMAGE_BYTES) dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
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

router.post("/fix-continue", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const conversationId = req.body?.conversationId; if (!conversationId) return res.status(400).json({ ok: false, message: "Thiếu conversationId" }); const latest = await getLatestCodeArtifact(conversationId); if (!latest) return res.status(400).json({ ok: false, message: "Không có dự án để sửa." }); const projectFiles = await getAllFiles({ conversationId }); const currentVersion = latest.version || 1; const fileNames = Object.keys(projectFiles); if (fileNames.length === 0) return res.status(400).json({ ok: false, message: "Dự án rỗng." }); const targetFile = fileNames[0]; const lang = targetFile.split('.').pop(); const originalCode = projectFiles[targetFile]; const fixResult = await runStrictFixLoop({ userId, conversationId, language: lang, initialCode: originalCode, currentVersion, signal: null }); if (fixResult.ok) { try { await upsertFile({ userId, conversationId, filename: targetFile, content: fixResult.code, language: lang }); await saveArtifact({ userId, conversationId, files: {}, version: currentVersion + 1 }); } catch {} const hasChanged = fixResult.code !== originalCode; const statusMsg = hasChanged ? `✅ Đã sửa xong file \`${targetFile}\`.` : `✅ File \`${targetFile}\` đã kiểm tra, không có lỗi.`; const finalText = `${statusMsg}\n\n\`\`\`${lang}\n${fixResult.code}\n\`\`\``; const delivered = await traKetQuaChoUser({ userId, conversationId, text: finalText, meta: { action: "resume-fixed" } }); return res.json({ ok: true, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } }); } else { const delivered = await traKetQuaChoUser({ userId, conversationId, text: `⚠ Còn lỗi: ${fixResult.error}`, meta: { action: "resume-fail" } }); return res.json({ ok: true, aiMessage: { ...delivered.aiMessage, id: String(delivered.aiMessage._id) } }); } } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.post("/conversations", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { projectId = null, title = null } = req.body || {}; const convo = await createConversation({ userId, projectId, title }); return res.json({ ok: true, conversation: { ...convo, id: String(convo._id) } }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.get("/conversations/:conversationId/messages", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const convo = await getConversation(userId, conversationId); if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy hội thoại" }); const raw = await listMessages(conversationId); const items = await Promise.all(raw.map(attachFilesToMessage)); return res.json({ ok: true, items }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.get("/conversations/recent", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const items = await listRecentConversations(userId, {}); return res.json({ ok: true, items }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.delete("/conversations/all", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const deleted = await deleteAllNonProjectConversations(userId); return res.json({ ok: true, deleted }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.delete("/conversations/:conversationId", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const ok = await dbDeleteConversation(userId, conversationId); if (!ok) return res.status(404).json({ ok: false, message: "Không xóa được" }); return res.json({ ok: true }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });
router.patch("/conversations/:conversationId", async (req, res) => { try { const userId = getUserId(req); if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" }); const { conversationId } = req.params; const { title } = req.body || {}; if (!title) return res.status(400).json({ ok: false, message: "Thiếu title" }); const convo = await getConversation(userId, conversationId); if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy" }); const ok = await updateConversationTitle(conversationId, String(title)); return res.json({ ok }); } catch (err) { return res.status(500).json({ ok: false, message: "Lỗi server" }); } });

export default router;