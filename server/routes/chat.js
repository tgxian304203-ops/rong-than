// server/routes/chat.js
// Nhiệm vụ: API chat — điểm vào chính của pipeline.
// Sửa: prompt lính buộc trả code thật. Phát hiện lính trả sai loại.

import express from "express";
import multer from "multer";

import {
  createConversation,
  listRecentConversations,
  getConversation,
  deleteConversation as dbDeleteConversation,
  deleteAllNonProjectConversations,
  updateConversationTitle,
} from "../db/conversations.js";
import { listMessages, listRecentMessages } from "../db/messages.js";
import {
  saveAttachment,
  listByMessage as listAttachmentsByMessage,
} from "../db/attachments.js";
import {
  getLatestAny as getLatestCodeArtifact,
  saveArtifact,
} from "../db/codeArtifacts.js";
import { loadWorkState } from "../state/luu-trang-thai.js";

import { nhanYeuCau as gwNhanYeuCau } from "../gateway/nhan-yeu-cau.js";
import { chuyenYeuCauChoBoss } from "../gateway/chuyen-yeu-cau-cho-boss.js";
import { nhanKetQuaTuBoss } from "../gateway/nhan-ket-qua-tu-boss.js";
import { traKetQuaChoUser } from "../gateway/tra-ket-qua-cho-user.js";

import { nhanYeuCau as bossNhanYeuCau } from "../boss/nhan-yeu-cau.js";
import { phanTichYeuCau } from "../boss/phan-tich-yeu-cau.js";
import { traWeb, formatWebResults } from "../boss/tra-web.js";
import { vietFormat } from "../boss/viet-format.js";
import { giaoFormat } from "../boss/giao-format.js";
import { nhanKetQuaLinh } from "../boss/nhan-ket-qua-linh.js";
import { danhGiaKetQua } from "../boss/danh-gia-ket-qua.js";
import { vongLapSua } from "../boss/vong-lap-sua.js";

import { chonBossTheoYeuCau } from "../dai-nao/chon-boss-theo-yeu-cau.js";
import { goiBoss } from "../dai-nao/goi-boss.js";
import { goiBossMoi } from "../dai-nao/goi-boss-moi.js";
import {
  banGiaoTrangThai,
  buildHandoffPrompt,
} from "../dai-nao/ban-giao-trang-thai.js";

import { goiLinh } from "../tieu-nao/goi-linh.js";
import { chunkText } from "../utils/chunker.js";

import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.MAX_UPLOAD_BYTES,
    files: LIMITS.MAX_ATTACHMENTS_PER_MESSAGE,
  },
});

// ============================================================
// HELPER
// ============================================================

function getUserId(req) {
  const v = req.headers["x-user-id"];
  return v ? String(v) : null;
}

async function attachFilesToMessage(msg) {
  if (!msg) return msg;
  try {
    const atts = await listAttachmentsByMessage(String(msg._id));
    const mapped = atts.map((a) => ({
      id: String(a._id),
      name: a.name,
      type: a.type,
      size: a.size,
      url: a.url || "",
      dataUrl: a.dataUrl || "",
    }));
    return { ...msg, id: String(msg._id), attachments: mapped };
  } catch {
    return { ...msg, id: String(msg._id), attachments: [] };
  }
}

async function loadConversationHistory(conversationId) {
  try {
    return await listRecentMessages(conversationId, LIMITS.CONTEXT_MESSAGES_LIMIT);
  } catch {
    return [];
  }
}

// ============================================================
// PIPELINE BOSS — LẦN ĐẦU
// ============================================================

async function runBossPipeline({
  userId,
  conversationId,
  userRequest,
  userLabel,
  signal,
}) {
  const recv = await bossNhanYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!recv.ok) return { ok: false, error: recv.error };

  const history = await loadConversationHistory(conversationId);
  const historyForContext = history.slice(0, -1);

  const analysis = await phanTichYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
    history: historyForContext,
    signal,
  });
  if (!analysis.ok) return { ok: false, error: analysis.error };

  if (analysis.analysis.strategy === "chunk") {
    return await runChunkedPipeline({
      userId,
      conversationId,
      userRequest,
      userLabel,
      analysis: analysis.analysis,
      historyForContext,
      signal,
    });
  }

  let webContext = "";
  if (analysis.analysis.needWeb) {
    const web = await traWeb({
      userId,
      conversationId,
      query: userRequest,
      signal,
    });
    if (web.ok) webContext = formatWebResults(web.results);
  }

  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  const bossMessages = buildBossPlanMessages({
    userRequest,
    analysis: analysis.analysis,
    webContext,
    history: historyForContext,
  });

  let bossRes = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages: bossMessages,
    temperature: 0.4,
    maxTokens: 4096,
    signal,
  });

  if (!bossRes.ok) {
    const handoff = await banGiaoTrangThai({ userId, conversationId });
    const handoffPrompt = handoff.ok ? buildHandoffPrompt(handoff.handoff) : "";
    const messagesWithHandoff = handoffPrompt
      ? [...bossMessages, { role: "system", content: handoffPrompt }]
      : bossMessages;

    bossRes = await goiBossMoi({
      userId,
      conversationId,
      oldSession: null,
      messages: messagesWithHandoff,
      temperature: 0.4,
      maxTokens: 4096,
      signal,
    });
  }

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;
  const bossPlan = bossRes.ok ? bossRes.text : "";

  const formatRes = await vietFormat({
    userId,
    conversationId,
    userRequest,
    analysis: analysis.analysis,
    webContext: [webContext, bossPlan].filter(Boolean).join("\n\n"),
    history: historyForContext,
  });
  if (!formatRes.ok) return { ok: false, error: formatRes.error };

  const giao = await giaoFormat({
    userId,
    conversationId,
    bossSessionId,
    format: formatRes.format,
  });
  if (!giao.ok) return { ok: false, error: giao.error };

  // ============================================================
  // GỌI LÍNH — LẶP TỚI KHI ĐÚNG
  // ============================================================
  let soldierMessages = buildSoldierMessages({
    userRequest,
    format: formatRes.format,
    webContext,
    history: historyForContext,
  });

  let attempt = 0;
  const MAX_ATTEMPTS = 3;
  let linh = null;
  let finalOutput = "";
  let language = "html";
  let initialCode = "";

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;

    await logInfo(`BOSS: gọi lính — lần thử ${attempt}/${MAX_ATTEMPTS}`, {
      userId,
      conversationId,
      needCode: analysis.analysis.needCode,
    });

    linh = await goiLinh({
      userId,
      taskId: giao.taskId,
      soldier: giao.soldier,
      candidates: giao.candidates,
      messages: soldierMessages,
      payload: formatRes.format,
      temperature: 0.3,
      maxTokens: 8192,
      signal,
    });

    if (!linh.ok) {
      await logWarn("BOSS: lính thất bại", {
        attempt,
        error: linh.error,
      });
      if (attempt >= MAX_ATTEMPTS) {
        return {
          ok: false,
          error: linh.error || "Lính không hoàn thành",
          errorHistory: linh.errorHistory,
        };
      }
      continue;
    }

    finalOutput = linh.text || "";

    // ============================================================
    // PHÁT HIỆN LÍNH TRẢ SAI LOẠI (KHI CẦN CODE)
    // ============================================================
    if (analysis.analysis.needCode) {
      const validation = validateCodeOutput(finalOutput);

      if (!validation.ok) {
        await logWarn(
          `BOSS: lính trả sai loại — yêu cầu làm lại (lần ${attempt})`,
          {
            reason: validation.reason,
            preview: finalOutput.slice(0, 200),
          }
        );

        // BOSS viết format sửa
        const fixFormat = buildWrongTypeFixFormat({
          originalFormat: formatRes.format,
          reason: validation.reason,
          badOutput: finalOutput,
          attempt,
        });

        // Gọi lính mới với format sửa
        soldierMessages = buildSoldierMessages({
          userRequest,
          format: fixFormat,
          webContext,
          history: historyForContext,
        });

        // Reset linh để lần sau gọi mới
        const newGiao = await giaoFormat({
          userId,
          conversationId,
          bossSessionId,
          format: fixFormat,
        });
        if (newGiao.ok) {
          giao = newGiao;
        }

        continue;
      }

      // Code hợp lệ
      language = validation.language || "html";
      initialCode = validation.code || "";
    } else {
      // Không phải code → chấp nhận
      break;
    }
  }

  // ============================================================
  // SAU KHI LÍNH TRẢ ĐÚNG — SANDBOX
  // ============================================================
  const received = await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: giao.taskId,
  });
  if (!received.ok) return { ok: false, error: received.error };

  const danhGia = await danhGiaKetQua({
    analysis: analysis.analysis,
    mergedText: received.merged || finalOutput,
    failures: received.failures,
  });

  let finalText = finalOutput || received.merged || "";
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;

  if (danhGia.needSandbox && initialCode) {
    const loop = await vongLapSua({
      userId,
      conversationId,
      bossSessionId,
      language,
      initialCode,
      goal: userRequest,
      signal,
    });

    sandboxMeta = loop.lastRun
      ? {
          status: loop.lastRun.status,
          runId: loop.lastRun.runId,
          attempts: loop.attempts,
        }
      : null;

    try {
      const saved = await saveArtifact({
        userId,
        conversationId,
        language,
        code: loop.finalCode || initialCode,
        version: (loop.version || 1) + 1,
      });
      codeMeta = {
        language,
        version: saved.version,
        artifactId: String(saved._id),
      };
    } catch {
      /* bỏ qua */
    }

    if (loop.ok) {
      finalText = `✅ Code đã vượt qua kiểm thử Sandbox (v${
        loop.version || 1
      }, ${loop.attempts} lần thử).\n\n\`\`\`${language}\n${loop.finalCode}\n\`\`\``;
      resumeAvailable = false;
    } else {
      finalText = `⚠ Chưa vượt qua kiểm thử sau ${loop.attempts} lần thử.\n\nLỗi cuối:\n${
        loop.lastRun?.stderr || "(không rõ)"
      }\n\nCode hiện tại:\n\`\`\`${language}\n${loop.finalCode}\n\`\`\`\n\nBấm nút **🔧 Sửa tiếp** để tiếp tục sửa từ code này.`;
      resumeAvailable = true;
    }
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      analysis: analysis.analysis,
      sandbox: sandboxMeta,
      code: codeMeta,
      web: webContext ? { used: true } : null,
      boss: bossRes.boss || bossPick.boss,
      soldier: linh.soldier || giao.soldier,
      resumeAvailable,
      soldierAttempts: attempt,
    },
  };
}

// ============================================================
// VALIDATE CODE OUTPUT — PHÁT HIỆN SAI LOẠI
// ============================================================

/**
 * Kiểm tra lính có trả về code hợp lệ không.
 * @param {string} text
 * @returns {{ok: boolean, code?: string, language?: string, reason?: string}}
 */
function validateCodeOutput(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, reason: "Không có nội dung" };
  }

  // Tìm code block
  const codeBlocks = [];
  const re = /```([a-zA-Z0-9+\-#.]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    codeBlocks.push({
      lang: (match[1] || "").toLowerCase().trim(),
      body: match[2] || "",
    });
  }

  if (codeBlocks.length === 0) {
    return { ok: false, reason: "Không có code block ```...```" };
  }

  // Duyệt tìm block hợp lệ
  for (const block of codeBlocks) {
    const body = block.body.trim();

    // 1. Phát hiện shell/git commands → sai
    if (isShellScript(body)) {
      continue;
    }

    // 2. Nếu block ghi html → kiểm tra có HTML thật
    if (block.lang === "html" || block.lang === "htm") {
      if (isRealHtml(body)) {
        return { ok: true, code: body, language: "html" };
      }
      continue;
    }

    // 3. Block JS thật
    if (block.lang === "javascript" || block.lang === "js") {
      if (isRealJavaScript(body)) {
        return { ok: true, code: body, language: "javascript" };
      }
      continue;
    }

    // 4. Python thật
    if (block.lang === "python" || block.lang === "py") {
      if (isRealPython(body)) {
        return { ok: true, code: body, language: "python" };
      }
      continue;
    }
  }

  // Không có block nào hợp lệ
  const firstLang = codeBlocks[0]?.lang || "không rõ";
  if (codeBlocks.some((b) => isShellScript(b.body))) {
    return {
      ok: false,
      reason:
        "Lính trả về shell/git commands — cần trả về code chạy được (HTML/JS/Python)",
    };
  }

  return {
    ok: false,
    reason: `Code block ngôn ngữ "${firstLang}" không hợp lệ hoặc không chạy được`,
  };
}

/**
 * Kiểm tra đoạn text có phải shell/git commands không.
 */
function isShellScript(body) {
  const s = body.toLowerCase();

  // Đặc trưng shell/git
  const shellPatterns = [
    /^\s*git\s+(init|add|commit|push|pull|clone|remote|checkout|branch|merge|status|log)/m,
    /^\s*npm\s+(install|run|start|init|build|test)/m,
    /^\s*yarn\s+(install|add|run|start)/m,
    /^\s*cd\s+[a-zA-Z]/m,
    /^\s*mkdir\s+/m,
    /^\s*rm\s+-rf/m,
    /^\s*touch\s+/m,
    /^\s*chmod\s+/m,
    /^\s*chown\s+/m,
    /^\s*export\s+[A-Z_]+=/m,
    /^\s*sudo\s+/m,
    /^\s*apt-get\s+/m,
    /^\s*brew\s+install/m,
    /^\s*pip\s+install/m,
    /^\s*python\s+-m/m,
    /^\s*node\s+[a-zA-Z]/m,
    /^\s*curl\s+-/m,
    /^\s*wget\s+/m,
    /^\s*docker\s+/m,
  ];

  let shellMatches = 0;
  for (const p of shellPatterns) {
    if (p.test(s)) shellMatches++;
  }

  // Nếu có >= 2 dòng shell → là shell script
  if (shellMatches >= 2) return true;

  // Nếu > 50% dòng bắt đầu bằng shell command
  const lines = body.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return false;

  const shellLineCount = lines.filter((l) =>
    /^\s*(git|npm|yarn|cd|mkdir|rm|touch|chmod|chown|export|sudo|apt-get|brew|pip|python|node|curl|wget|docker|echo)\s/.test(
      l
    )
  ).length;

  return shellLineCount / lines.length > 0.5;
}

function isRealHtml(body) {
  const s = body.toLowerCase();
  // Phải có ít nhất 2 thẻ HTML đặc trưng
  let count = 0;
  if (/<html[\s>]/i.test(body)) count++;
  if (/<head[\s>]/i.test(body)) count++;
  if (/<body[\s>]/i.test(body)) count++;
  if (/<div[\s>]/i.test(body)) count++;
  if (/<p[\s>]/i.test(body)) count++;
  if (/<script[\s>]/i.test(body)) count++;
  if (/<h[1-6][\s>]/i.test(body)) count++;
  if (/<button[\s>]/i.test(body)) count++;
  if (/<input[\s>]/i.test(body)) count++;

  return count >= 2;
}

function isRealJavaScript(body) {
  // Ít nhất 1 trong các từ khóa JS
  return /(function\s+|const\s+|let\s+|var\s+|=>|class\s+|import\s+|export\s+)/i.test(
    body
  );
}

function isRealPython(body) {
  return /(def\s+|class\s+|import\s+|from\s+|print\s*\()/i.test(body);
}

// ============================================================
// FORMAT SỬA KHI LÍNH TRẢ SAI LOẠI
// ============================================================

function buildWrongTypeFixFormat({
  originalFormat,
  reason,
  badOutput,
  attempt,
}) {
  return {
    taskType: originalFormat.taskType,
    goal: `LẦN TRƯỚC BẠN ĐÃ TRẢ SAI LOẠI. Hãy trả lại cho đúng.

Lý do sai: ${reason}

Yêu cầu GỐC của User:
${originalFormat.goal}

QUY TẮC BẮT BUỘC:
- Trả về CODE HTML/JS/PYTHON CHẠY ĐƯỢC — không phải shell script.
- KHÔNG trả về lệnh git, npm, cd, mkdir, hay hướng dẫn cài đặt.
- Code HTML phải có <!DOCTYPE html>, <html>, <head>, <body> đầy đủ.
- Code phải chạy được NGAY khi mở file index.html trong trình duyệt.
- KHÔNG mô tả — trả về code thật.`,
    input: "",
    constraints: [
      "Ngôn ngữ: HTML hoặc JavaScript hoặc Python",
      "KHÔNG dùng shell commands (git, npm, cd...)",
      "Code phải CHẠY ĐƯỢC",
    ],
    expectedOutput:
      "Code HTML/JS/Python hoàn chỉnh, chạy được ngay, không phải shell script.",
    context: {
      attempt,
      reason,
      badOutputPreview: String(badOutput || "").slice(0, 300),
      isWrongType: true,
    },
    subtasks: [],
    risks: [],
    qualityCriteria: [],
  };
}

// ============================================================
// PIPELINE CHUNKED — GIỮ NGUYÊN
// ============================================================

async function runChunkedPipeline({
  userId,
  conversationId,
  userRequest,
  userLabel,
  analysis,
  historyForContext,
  signal,
}) {
  const chunks = chunkText(userRequest);

  await logInfo("BOSS: chạy pipeline CHUNKED", {
    userId,
    conversationId,
    chunkCount: chunks.length,
  });

  const outputs = [];
  const codeChunks = [];
  let lastLanguage = "html";
  let lastBossSessionId = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunkReq = `[PHẦN ${i + 1}/${chunks.length}]\n${chunks[i]}`;

    const bossPick = await chonBossTheoYeuCau({ userId });
    if (!bossPick.ok) continue;

    const bossMessages = buildBossPlanMessages({
      userRequest: chunkReq,
      analysis,
      webContext: "",
      history: i === 0 ? historyForContext : [],
    });

    const bossRes = await goiBoss({
      userId,
      conversationId,
      boss: bossPick.boss,
      candidates: bossPick.candidates,
      messages: bossMessages,
      temperature: 0.4,
      maxTokens: 4096,
      signal,
    });

    const bossPlan = bossRes.ok ? bossRes.text : "";
    const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;
    lastBossSessionId = bossSessionId;

    const formatRes = await vietFormat({
      userId,
      conversationId,
      userRequest: chunkReq,
      analysis,
      webContext: bossPlan,
      history: i === 0 ? historyForContext : [],
    });
    if (!formatRes.ok) continue;

    const giao = await giaoFormat({
      userId,
      conversationId,
      bossSessionId,
      format: formatRes.format,
    });
    if (!giao.ok) continue;

    const soldierMessages = buildSoldierMessages({
      userRequest: chunkReq,
      format: formatRes.format,
      webContext: "",
      history: i === 0 ? historyForContext : [],
    });

    const linh = await goiLinh({
      userId,
      taskId: giao.taskId,
      soldier: giao.soldier,
      candidates: giao.candidates,
      messages: soldierMessages,
      payload: formatRes.format,
      temperature: 0.3,
      maxTokens: 8192,
      signal,
    });

    if (!linh.ok) continue;

    const partOutput = linh.text || "";

    if (analysis.needCode) {
      const validation = validateCodeOutput(partOutput);

      if (!validation.ok) {
        outputs.push(`[Phần ${i + 1}]\n${partOutput}`);
        continue;
      }

      const lang = validation.language;
      const code = validation.code;
      lastLanguage = lang;
      codeChunks.push(code);

      const loop = await vongLapSua({
        userId,
        conversationId,
        bossSessionId,
        language: lang,
        initialCode: code,
        goal: chunkReq,
        signal,
      });

      if (loop.ok) {
        outputs.push(
          `[Phần ${i + 1}]\n\`\`\`${lang}\n${loop.finalCode}\n\`\`\``
        );
      } else {
        outputs.push(
          `[Phần ${i + 1}]\n\`\`\`${lang}\n${loop.finalCode || code}\n\`\`\``
        );
      }
    } else {
      outputs.push(`[Phần ${i + 1}]\n${partOutput}`);
    }
  }

  let finalText = outputs.join("\n\n");
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;

  if (analysis.needCode && codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);

    const finalLoop = await vongLapSua({
      userId,
      conversationId,
      bossSessionId: lastBossSessionId,
      language: lastLanguage,
      initialCode: mergedCode,
      goal: userRequest,
      signal,
    });

    sandboxMeta = finalLoop.lastRun
      ? {
          status: finalLoop.lastRun.status,
          runId: finalLoop.lastRun.runId,
          attempts: finalLoop.attempts,
          finalMerge: true,
        }
      : null;

    try {
      const saved = await saveArtifact({
        userId,
        conversationId,
        language: lastLanguage,
        code: finalLoop.finalCode || mergedCode,
        version: (finalLoop.version || 1) + 1,
      });
      codeMeta = {
        language: lastLanguage,
        version: saved.version,
        artifactId: String(saved._id),
      };
    } catch {
      /* bỏ qua */
    }

    if (finalLoop.ok) {
      finalText = `✅ Code đã vượt qua kiểm thử Sandbox cuối (v${
        finalLoop.version || 1
      }, ${finalLoop.attempts} lần thử).\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\``;
      resumeAvailable = false;
    } else {
      finalText = `⚠ Code ghép chưa vượt qua kiểm thử cuối sau ${finalLoop.attempts} lần thử.\n\nLỗi cuối:\n${
        finalLoop.lastRun?.stderr || "(không rõ)"
      }\n\nCode hiện tại:\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\`\n\nBấm nút **🔧 Sửa tiếp** để tiếp tục.`;
      resumeAvailable = true;
    }
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      analysis,
      sandbox: sandboxMeta,
      code: codeMeta,
      chunked: true,
      chunkCount: chunks.length,
      resumeAvailable,
    },
  };
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
      if (bodyMatch) {
        bodyContent += "\n" + bodyMatch[1];
      } else {
        bodyContent += "\n" + chunk;
      }
    }

    return `<!DOCTYPE html>
<html lang="vi">
<head>
${headContent}
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  return codeChunks.join("\n\n");
}

// ============================================================
// PIPELINE BOSS — RESUME
// ============================================================

async function runBossResume({ userId, conversationId, signal }) {
  await logInfo("BOSS: BẮT ĐẦU RESUME", { userId, conversationId });

  const workState = await loadWorkState(userId, conversationId);
  const goal = workState?.userRequest || "Sửa code cho tới khi hết lỗi";

  const latest = await getLatestCodeArtifact(conversationId);
  if (!latest || !latest.code) {
    return {
      ok: false,
      error: "Không tìm thấy code để sửa tiếp. Vui lòng tạo code mới.",
    };
  }

  const language = latest.language || "javascript";
  const currentCode = latest.code;

  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  const bossSessionId = null;

  const loop = await vongLapSua({
    userId,
    conversationId,
    bossSessionId,
    language,
    initialCode: currentCode,
    goal,
    signal,
  });

  let codeMeta = null;
  try {
    const saved = await saveArtifact({
      userId,
      conversationId,
      language,
      code: loop.finalCode || currentCode,
      version: (latest.version || 1) + 1,
    });
    codeMeta = {
      language,
      version: saved.version,
      artifactId: String(saved._id),
    };
  } catch {
    /* bỏ qua */
  }

  const sandboxMeta = loop.lastRun
    ? {
        status: loop.lastRun.status,
        runId: loop.lastRun.runId,
        attempts: loop.attempts,
      }
    : null;

  let finalText;
  let resumeAvailable = false;

  if (loop.ok) {
    finalText = `✅ Sửa tiếp thành công! Code đã vượt qua kiểm thử Sandbox (v${
      codeMeta?.version || "?"
    }, ${loop.attempts} lần thử).\n\n\`\`\`${language}\n${loop.finalCode}\n\`\`\``;
  } else {
    finalText = `⚠ Vẫn còn lỗi sau ${loop.attempts} lần sửa tiếp.\n\nLỗi cuối:\n${
      loop.lastRun?.stderr || "(không rõ)"
    }\n\nCode hiện tại:\n\`\`\`${language}\n${loop.finalCode}\n\`\`\`\n\nBấm nút **🔧 Sửa tiếp** để tiếp tục.`;
    resumeAvailable = true;
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      sandbox: sandboxMeta,
      code: codeMeta,
      boss: bossPick.boss,
      resume: true,
      resumeAvailable,
    },
  };
}

// ============================================================
// XÂY MESSAGES
// ============================================================

function buildBossPlanMessages({ userRequest, analysis, webContext, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là điều phối viên nội bộ. Trả lời ngắn gọn cho bộ phận kỹ thuật. " +
        "Không dùng LaTeX hay $$.",
    },
  ];

  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    });
  }

  const lines = [
    "Yêu cầu hiện tại của User:",
    userRequest,
    "",
    "Phân tích:",
    `- taskType: ${analysis.taskType}`,
    `- goal: ${analysis.goal}`,
    `- needWeb: ${analysis.needWeb}`,
    `- needCode: ${analysis.needCode}`,
  ];

  if (analysis.requirements?.length) {
    lines.push(`- requirements: ${analysis.requirements.join("; ")}`);
  }
  if (analysis.constraints?.length) {
    lines.push(`- constraints: ${analysis.constraints.join("; ")}`);
  }

  if (webContext) {
    lines.push("", "Dữ liệu Web:", webContext);
  }

  lines.push("", "Trả về kế hoạch xử lý ngắn gọn.");

  messages.push({ role: "user", content: lines.join("\n") });

  return messages;
}

function buildSoldierMessages({ userRequest, format, webContext, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là trợ lý AI thông minh. Trả lời TRỰC TIẾP cho người dùng bằng tiếng Việt.\n" +
        "QUY TẮC BẮT BUỘC:\n" +
        "1. KHÔNG nhắc đến 'BOSS', 'Tiểu Não', 'lính', 'báo cáo'.\n" +
        "2. KHÔNG dùng LaTeX hay ký hiệu $$.\n" +
        "3. Nếu User yêu cầu 'tạo app/web/tool/website' → PHẢI trả về FILE HTML đầy đủ, chạy được.\n" +
        "4. KHÔNG trả về lệnh git, npm, cd, mkdir hay hướng dẫn cài đặt.\n" +
        "5. KHÔNG mô tả — trả về CODE THẬT trong ```html...```.\n" +
        "6. Code HTML phải có <!DOCTYPE html>, <html>, <head>, <body> đầy đủ.\n" +
        "7. Code phải chạy được NGAY khi mở file index.html trong trình duyệt.\n" +
        "8. Nếu User yêu cầu 'X chữ', phải đảm bảo đủ X chữ. Đếm trước khi trả.",
    },
  ];

  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    });
  }

  const lines = [
    "Yêu cầu hiện tại của User:",
    userRequest,
    "",
    "Hướng dẫn xử lý:",
    format.goal,
    "",
    `Loại nhiệm vụ: ${format.taskType}`,
  ];

  if (format.constraints?.length) {
    lines.push("", "Ràng buộc:");
    for (const c of format.constraints) lines.push(`- ${c}`);
  }

  if (format.expectedOutput) {
    lines.push("", "Kết quả mong đợi:", format.expectedOutput);
  }

  if (format.qualityCriteria?.length) {
    lines.push("", "Tiêu chí chất lượng:");
    for (const c of format.qualityCriteria) lines.push(`- ${c}`);
  }

  if (webContext) {
    lines.push("", "Dữ liệu tra cứu:", webContext);
  }

  lines.push(
    "",
    "Trả lời trực tiếp cho User bằng tiếng Việt.",
    "Nếu là code → đặt trong ```html...``` — CODE CHẠY ĐƯỢC, không phải shell script."
  );

  messages.push({ role: "user", content: lines.join("\n") });

  return messages;
}

// ============================================================
// ROUTE — GỬI TIN NHẮN
// ============================================================

router.post(
  "/send",
  (req, res, next) => {
    upload.array("attachments", 10)(req, res, (err) => {
      if (err) {
        logWarn("Multer upload lỗi", {
          error: err?.message || String(err),
          code: err?.code || "",
        });
        return res.status(400).json({
          ok: false,
          message: err?.message || "Lỗi upload tệp đính kèm",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const files = Array.isArray(req.files) ? req.files : [];

      if (!userId) {
        return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
      }

      const conversationId = req.body?.conversationId;
      let text = String(req.body?.text || "").trim();

      if (!conversationId) {
        return res
          .status(400)
          .json({ ok: false, message: "Thiếu conversationId" });
      }

      if (!text && files.length === 0) {
        return res.status(400).json({ ok: false, message: "Tin nhắn rỗng" });
      }

      if (!text && files.length > 0) {
        text = "[Ảnh đính kèm]";
      }

      const recv = await gwNhanYeuCau({
        userId,
        conversationId,
        text,
        attachments: [],
      });
      if (!recv.ok) {
        return res.status(400).json({ ok: false, message: recv.error });
      }

      const savedAttachments = [];
      if (files.length > 0 && recv.userMessage?._id) {
        for (const f of files) {
          try {
            const isImage = String(f.mimetype || "").startsWith("image/");
            const tooBig = isImage && f.size > MAX_IMAGE_BYTES;

            let dataUrl = "";
            if (isImage && !tooBig) {
              dataUrl = `data:${f.mimetype};base64,${f.buffer.toString(
                "base64"
              )}`;
            }

            const att = await saveAttachment({
              userId,
              conversationId,
              messageId: String(recv.userMessage._id),
              name: f.originalname || "tệp",
              type: f.mimetype || "application/octet-stream",
              size: f.size || 0,
              url: "",
              dataUrl,
            });

            savedAttachments.push({
              id: String(att._id),
              name: att.name,
              type: att.type,
              size: att.size,
              url: "",
              dataUrl: att.dataUrl || "",
            });
          } catch (e) {
            await logWarn("Không lưu được tệp đính kèm", {
              name: f?.originalname,
              error: e?.message || String(e),
            });
          }
        }
      }

      let bossUserRequest = String(text || "");
      if (savedAttachments.length > 0) {
        const attachDesc = savedAttachments
          .map(
            (a, i) => `[${i + 1}] ${a.name} — ${a.type} — ${a.size} bytes`
          )
          .join("\n");
        bossUserRequest = `${bossUserRequest}\n\n[Tệp đính kèm: ${savedAttachments.length}]\n${attachDesc}`;
      }

      const bossResult = await chuyenYeuCauChoBoss({
        userId,
        conversationId,
        userRequest: bossUserRequest,
        userLabel: null,
        runBoss: runBossPipeline,
      });

      const received = await nhanKetQuaTuBoss({
        userId,
        conversationId,
        bossResult,
      });
      if (!received.ok) {
        return res.status(500).json({ ok: false, message: received.error });
      }

      const delivered = await traKetQuaChoUser({
        userId,
        conversationId,
        text: received.text,
        meta: received.meta,
      });
      if (!delivered.ok) {
        return res.status(500).json({ ok: false, message: delivered.error });
      }

      return res.json({
        ok: true,
        userMessage: {
          ...recv.userMessage,
          id: String(recv.userMessage._id),
          attachments: savedAttachments,
        },
        aiMessage: {
          ...delivered.aiMessage,
          id: String(delivered.aiMessage._id),
        },
      });
    } catch (err) {
      await logWarn("Lỗi /chat/send", { error: err?.message || String(err) });
      return res.status(500).json({ ok: false, message: "Lỗi server" });
    }
  }
);

// ============================================================
// ROUTE — SỬA TIẾP (RESUME)
// ============================================================

router.post("/fix-continue", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const conversationId = req.body?.conversationId;
    if (!conversationId) {
      return res
        .status(400)
        .json({ ok: false, message: "Thiếu conversationId" });
    }

    try {
      await gwNhanYeuCau({
        userId,
        conversationId,
        text: "🔧 Sửa tiếp",
        attachments: [],
      });
    } catch {
      /* bỏ qua */
    }

    const bossResult = await chuyenYeuCauChoBoss({
      userId,
      conversationId,
      userRequest: "Sửa tiếp code hiện tại cho tới khi hết lỗi",
      userLabel: null,
      runBoss: runBossResume,
    });

    const received = await nhanKetQuaTuBoss({
      userId,
      conversationId,
      bossResult,
    });
    if (!received.ok) {
      return res.status(500).json({ ok: false, message: received.error });
    }

    const delivered = await traKetQuaChoUser({
      userId,
      conversationId,
      text: received.text,
      meta: received.meta,
    });
    if (!delivered.ok) {
      return res.status(500).json({ ok: false, message: delivered.error });
    }

    return res.json({
      ok: true,
      aiMessage: {
        ...delivered.aiMessage,
        id: String(delivered.aiMessage._id),
      },
    });
  } catch (err) {
    await logWarn("Lỗi /chat/fix-continue", {
      error: err?.message || String(err),
    });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — TẠO HỘI THOẠI
// ============================================================

router.post("/conversations", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId = null, title = null } = req.body || {};
    const convo = await createConversation({ userId, projectId, title });
    return res.json({
      ok: true,
      conversation: { ...convo, id: String(convo._id) },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — LẤY TIN NHẮN
// ============================================================

router.get("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId } = req.params;
    const convo = await getConversation(userId, conversationId);
    if (!convo) {
      return res
        .status(404)
        .json({ ok: false, message: "Không tìm thấy hội thoại" });
    }

    const raw = await listMessages(conversationId);
    const items = await Promise.all(raw.map(attachFilesToMessage));

    return res.json({ ok: true, items });
  } catch (err) {
    await logWarn("Lỗi get messages", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — LỊCH SỬ
// ============================================================

router.get("/conversations/recent", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const items = await listRecentConversations(userId, {});
    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — XÓA TẤT CẢ
// ============================================================

router.delete("/conversations/all", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const deleted = await deleteAllNonProjectConversations(userId);
    return res.json({ ok: true, deleted });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — XÓA HỘI THOẠI
// ============================================================

router.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId } = req.params;
    const ok = await dbDeleteConversation(userId, conversationId);
    if (!ok)
      return res.status(404).json({ ok: false, message: "Không xóa được" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — ĐỔI TÊN HỘI THOẠI
// ============================================================

router.patch("/conversations/:conversationId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId } = req.params;
    const { title } = req.body || {};
    if (!title)
      return res.status(400).json({ ok: false, message: "Thiếu title" });

    const convo = await getConversation(userId, conversationId);
    if (!convo)
      return res.status(404).json({ ok: false, message: "Không tìm thấy" });

    const ok = await updateConversationTitle(conversationId, String(title));
    return res.json({ ok });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;