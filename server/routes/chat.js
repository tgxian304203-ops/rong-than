// server/routes/chat.js
// Nhiệm vụ: API chat — pipeline theo 7 bước dự án.
//
// LUỒNG HOẠT ĐỘNG:
//   Bước 1: Rồng Thần nhận tin nhắn
//   Bước 2: Xác nhận BOSS phù hợp
//   Bước 3: BOSS tiếp quản cuộc trò chuyện
//   Bước 4: BOSS viết format cho lính (nếu cần web → BOSS tự tra)
//   Bước 5: Lính làm → trả đáp án cho BOSS
//   Bước 6: Nếu code → BOSS test Sandbox
//   Bước 7: BOSS trả kết quả cho User (đúng → trả, sai → lặp sửa)

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
import { countTokens, countMessagesTokens } from "../utils/token-counter.js";

import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const HISTORY_FOR_BOSS = 500;
const HISTORY_FOR_SOLDIER = 400;

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

async function loadConversationHistory(conversationId, limit) {
  try {
    return await listRecentMessages(conversationId, limit);
  } catch {
    return [];
  }
}

// ============================================================
// PIPELINE BOSS — 7 BƯỚC
// ============================================================

async function runBossPipeline({
  userId,
  conversationId,
  userRequest,
  userLabel,
  signal,
}) {
  // ============================================================
  // BƯỚC 1: RỒNG THẦN NHẬN TIN NHẮN
  // ============================================================
  const recv = await bossNhanYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!recv.ok) return { ok: false, error: recv.error };

  // Đọc lịch sử
  const historyForBoss = await loadConversationHistory(
    conversationId,
    HISTORY_FOR_BOSS
  );
  const historyForBossCtx = historyForBoss.slice(0, -1);
  const historyForSoldier = historyForBoss.slice(
    -HISTORY_FOR_SOLDIER - 1,
    -1
  );

  // ============================================================
  // BƯỚC 2: XÁC NHẬN BOSS PHÙ HỢP
  // ============================================================
  // Đại Não phân tích yêu cầu + chọn BOSS
  const analysis = await phanTichYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
    history: historyForBossCtx,
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
      historyForBoss: historyForBossCtx,
      historyForSoldier,
      signal,
    });
  }

  // ============================================================
  // BƯỚC 3: BOSS TIẾP QUẢN CUỘC TRÒ CHUYỆN
  // ============================================================
  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  const bossSession = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages: [
      {
        role: "system",
        content:
          "Bạn là BOSS của Rồng Thần — người tiếp quản cuộc trò chuyện với User.\n" +
          "Bạn là model AI — KHÔNG phải code.\n" +
          "Bạn sẽ:\n" +
          "1. Đọc yêu cầu User.\n" +
          "2. Nếu cần web → tự tra web.\n" +
          "3. Viết format điều phối lính (model khác).\n" +
          "4. Nhận kết quả từ lính.\n" +
          "5. Nếu code → kiểm Sandbox.\n" +
          "6. Trả câu trả lời cuối cho User.\n" +
          "KHÔNG dùng LaTeX hay $$.",
      },
      { role: "user", content: userRequest },
    ],
    temperature: 0.4,
    maxTokens: 2048,
    signal,
  });

  let bossRes = bossSession;
  if (!bossRes.ok) {
    const handoff = await banGiaoTrangThai({ userId, conversationId });
    const handoffPrompt = handoff.ok ? buildHandoffPrompt(handoff.handoff) : "";
    bossRes = await goiBossMoi({
      userId,
      conversationId,
      oldSession: null,
      messages: handoffPrompt
        ? [{ role: "system", content: handoffPrompt }]
        : [],
      temperature: 0.4,
      maxTokens: 2048,
      signal,
    });
  }

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;

  // ============================================================
  // BƯỚC 4: BOSS VIẾT FORMAT CHO LÍNH
  // ============================================================
  let webContext = "";

  // Nếu cần web → BOSS tự tra web (không gọi lính)
  if (analysis.analysis.needWeb) {
    const web = await traWeb({
      userId,
      conversationId,
      query: userRequest,
      signal,
    });
    if (web.ok) webContext = formatWebResults(web.results);
  }

  const formatRes = await vietFormat({
    userId,
    conversationId,
    userRequest,
    analysis: analysis.analysis,
    webContext,
    history: historyForBossCtx,
  });
  if (!formatRes.ok) return { ok: false, error: formatRes.error };

  const giao = await giaoFormat({
    userId,
    conversationId,
    bossSessionId,
    format: formatRes.format,
    tokens: countTokens(userRequest) +
      countMessagesTokens(
        historyForSoldier.map((m) => ({ role: m.role, content: m.text }))
      ),
  });
  if (!giao.ok) return { ok: false, error: giao.error };

  // ============================================================
  // BƯỚC 5: LÍNH LÀM → TRẢ ĐÁP ÁN CHO BOSS
  // ============================================================
  let soldierMessages = buildSoldierMessages({
    format: formatRes.format,
    webContext,
    history: historyForSoldier,
    userRequest,
  });

  let attempt = 0;
  const MAX_ATTEMPTS = 3;
  let linh = null;
  let soldierOutput = "";
  let language = "html";
  let initialCode = "";
  let currentGiao = giao;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;

    await logInfo(`BOSS: gọi lính — lần thử ${attempt}/${MAX_ATTEMPTS}`, {
      userId,
      conversationId,
      needCode: analysis.analysis.needCode,
    });

    linh = await goiLinh({
      userId,
      taskId: currentGiao.taskId,
      soldier: currentGiao.soldier,
      candidates: currentGiao.candidates,
      messages: soldierMessages,
      payload: formatRes.format,
      temperature: 0.3,
      maxTokens: 8192,
      signal,
      taskType: currentGiao.taskType,
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

    soldierOutput = linh.text || "";

    if (analysis.analysis.needCode) {
      const validation = validateCodeOutput(soldierOutput);

      if (!validation.ok) {
        await logWarn(
          `BOSS: lính trả sai loại — yêu cầu làm lại (lần ${attempt})`,
          { reason: validation.reason }
        );

        const fixFormat = buildWrongTypeFixFormat({
          originalFormat: formatRes.format,
          reason: validation.reason,
          badOutput: soldierOutput,
          attempt,
        });

        soldierMessages = buildSoldierMessages({
          format: fixFormat,
          webContext,
          history: historyForSoldier,
          userRequest,
        });

        const newGiao = await giaoFormat({
          userId,
          conversationId,
          bossSessionId,
          format: fixFormat,
          tokens: countTokens(userRequest) +
            countMessagesTokens(
              historyForSoldier.map((m) => ({
                role: m.role,
                content: m.text,
              }))
            ),
        });
        if (newGiao.ok) {
          currentGiao = newGiao;
        }

        continue;
      }

      language = validation.language || "html";
      initialCode = validation.code || "";
    } else {
      break;
    }
  }

  // Nhận kết quả lính
  const received = await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: currentGiao.taskId,
  });

  const danhGia = await danhGiaKetQua({
    analysis: analysis.analysis,
    mergedText: received.merged || soldierOutput,
    failures: received.failures,
  });

  // ============================================================
  // BƯỚC 6: NẾU CODE → BOSS TEST SANDBOX
  // ============================================================
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;
  let sandboxStatus = "not_run";

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
    sandboxStatus = loop.ok ? "passed" : "failed";
    resumeAvailable = !loop.ok;

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

    soldierOutput = loop.finalCode || initialCode;
  }

  // ============================================================
  // BƯỚC 7: BOSS TRẢ KẾT QUẢ CHO USER
  // ============================================================
  // BOSS đọc kết quả lính → viết câu trả lời cuối cho User.
  const finalText = await writeFinalAnswer({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    userRequest,
    analysis: analysis.analysis,
    soldierOutput,
    isCode: analysis.analysis.needCode,
    language,
    sandboxStatus,
    resumeAvailable,
    webContext,
    history: historyForBossCtx,
    signal,
  });

  return {
    ok: true,
    text: finalText,
    meta: {
      analysis: analysis.analysis,
      sandbox: sandboxMeta,
      code: codeMeta,
      web: webContext ? { used: true } : null,
      boss: bossRes.boss || bossPick.boss,
      soldier: linh.soldier || currentGiao.soldier,
      resumeAvailable,
      soldierAttempts: attempt,
    },
  };
}

// ============================================================
// BOSS VIẾT CÂU TRẢ LỜI CUỐI CHO USER
// ============================================================

async function writeFinalAnswer({
  userId,
  conversationId,
  boss,
  candidates,
  userRequest,
  analysis,
  soldierOutput,
  isCode,
  language,
  sandboxStatus,
  resumeAvailable,
  webContext,
  history = [],
  signal,
}) {
  // ===== Xây dựng messages =====
  const messages = [
    {
      role: "system",
      content:
        "Bạn là BOSS của Rồng Thần — người trả lời TRỰC TIẾP cho User.\n" +
        "Bạn vừa nhận kết quả từ lính (model khác) — hãy đọc và trả lời User.\n" +
        "\n" +
        "QUY TẮC BẮT BUỘC:\n" +
        "1. Trả lời User bằng tiếng Việt, tự nhiên, thân thiện.\n" +
        "2. KHÔNG nhắc đến 'lính', 'Tiểu Não', 'format', 'Sandbox'.\n" +
        "3. KHÔNG dùng LaTeX hay $$.\n" +
        "4. Nếu kết quả lính là CODE:\n" +
        "   - Nếu Sandbox PASS: trình bày code trong ```<lang>...``` đầy đủ.\n" +
        "   - Nếu Sandbox FAIL: thông báo User chưa qua kiểm thử, gợi ý 'Sửa tiếp'.\n" +
        "5. Nếu kết quả lính là VĂN BẢN: trình bày văn bản hoàn chỉnh.\n" +
        "6. Không tự bịa thêm thông tin ngoài kết quả lính.",
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
    "YÊU CẦU CỦA USER:",
    userRequest,
    "",
    "KẾT QUẢ LÍNH ĐÃ LÀM:",
    "```",
    soldierOutput || "(lính không có output)",
    "```",
    "",
    `TRẠNG THÁI SANDBOX: ${sandboxStatus}`,
  ];

  if (isCode) {
    lines.push(`NGÔN NGỮ CODE: ${language}`);
  }

  if (webContext) {
    lines.push("", "DỮ LIỆU WEB BOSS ĐÃ TRA:", webContext);
  }

  if (resumeAvailable) {
    lines.push(
      "",
      "LƯU Ý: Code chưa qua Sandbox — cần thông báo User có thể bấm 'Sửa tiếp'."
    );
  }

  lines.push(
    "",
    "Hãy viết câu trả lời HOÀN CHỈNH cho User dựa trên kết quả lính."
  );

  messages.push({ role: "user", content: lines.join("\n") });

  // ===== Gọi BOSS =====
  const res = await goiBoss({
    userId,
    conversationId,
    boss,
    candidates,
    messages,
    temperature: 0.5,
    maxTokens: 8192,
    signal,
  });

  if (res.ok && res.text) {
    return res.text;
  }

  // ===== Fallback: BOSS không viết được → dùng output lính =====
  await logWarn("BOSS không viết được câu trả lời cuối — dùng output lính", {
    userId,
    conversationId,
  });

  return formatFinalFallback({
    soldierOutput,
    isCode,
    language,
    sandboxStatus,
    resumeAvailable,
  });
}

// ============================================================
// FORMAT FALLBACK
// ============================================================

function formatFinalFallback({
  soldierOutput,
  isCode,
  language,
  sandboxStatus,
  resumeAvailable,
}) {
  if (!soldierOutput) return "(Không có kết quả)";

  if (!isCode) {
    return soldierOutput;
  }

  // Code
  if (sandboxStatus === "passed") {
    return `✅ Code đã vượt qua kiểm thử Sandbox.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\``;
  }

  if (resumeAvailable) {
    return `⚠ Code chưa vượt qua kiểm thử Sandbox.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\`\n\nBấm nút **🔧 Sửa tiếp** để tiếp tục.`;
  }

  return `\`\`\`${language}\n${soldierOutput}\n\`\`\``;
}

// ============================================================
// CHUNKED PIPELINE — giữ nguyên (đã đúng 7 bước)
// ============================================================

async function runChunkedPipeline({
  userId,
  conversationId,
  userRequest,
  userLabel,
  analysis,
  historyForBoss,
  historyForSoldier,
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

    const requestTokens = countTokens(chunkReq);
    const soldierHistoryTokens = countMessagesTokens(
      historyForSoldier.map((m) => ({ role: m.role, content: m.text }))
    );
    const soldierTokens = requestTokens + soldierHistoryTokens;

    const bossPick = await chonBossTheoYeuCau({ userId });
    if (!bossPick.ok) continue;

    const formatRes = await vietFormat({
      userId,
      conversationId,
      userRequest: chunkReq,
      analysis,
      webContext: "",
      history: i === 0 ? historyForBoss : [],
    });
    if (!formatRes.ok) continue;

    const giao = await giaoFormat({
      userId,
      conversationId,
      bossSessionId: null,
      format: formatRes.format,
      tokens: soldierTokens,
    });
    if (!giao.ok) continue;

    const soldierMessages = buildSoldierMessages({
      format: formatRes.format,
      webContext: "",
      history: historyForSoldier,
      userRequest: chunkReq,
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
      taskType: giao.taskType,
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
        bossSessionId: null,
        language: lang,
        initialCode: code,
        goal: chunkReq,
        signal,
      });

      if (loop.ok) {
        outputs.push(`[Phần ${i + 1}]\n\`\`\`${lang}\n${loop.finalCode}\n\`\`\``);
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
      finalText = `✅ Code đã vượt qua kiểm thử Sandbox cuối.\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\``;
    } else {
      finalText = `⚠ Code ghép chưa vượt qua kiểm thử cuối.\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\`\n\nBấm **🔧 Sửa tiếp** để tiếp tục.`;
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
// RESUME
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

  const loop = await vongLapSua({
    userId,
    conversationId,
    bossSessionId: null,
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

  // BOSS viết câu trả lời cuối
  const finalText = await writeFinalAnswer({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    userRequest: goal,
    analysis: { needCode: true, taskType: "fix" },
    soldierOutput: loop.finalCode || currentCode,
    isCode: true,
    language,
    sandboxStatus: loop.ok ? "passed" : "failed",
    resumeAvailable: !loop.ok,
    webContext: "",
    history: [],
    signal,
  });

  return {
    ok: true,
    text: finalText,
    meta: {
      sandbox: sandboxMeta,
      code: codeMeta,
      boss: bossPick.boss,
      resume: true,
      resumeAvailable: !loop.ok,
    },
  };
}

// ============================================================
// MESSAGES CHO LÍNH — LÍNH LÀM VIỆC, TRẢ CHO BOSS
// ============================================================

function buildSoldierMessages({ format, webContext, history = [], userRequest }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là lính — model AI được BOSS giao việc.\n" +
        "Nhiệm vụ: LÀM VIỆC mà BOSS giao, sau đó TRẢ KẾT QUẢ cho BOSS.\n" +
        "\n" +
        "QUY TẮC:\n" +
        "1. Nhận format từ BOSS — đọc kỹ nhiệm vụ.\n" +
        "2. Làm việc: viết code / viết văn / phân tích... theo yêu cầu.\n" +
        "3. TRẢ KẾT QUẢ cho BOSS — không tự nhận mình là trợ lý.\n" +
        "4. Nếu yêu cầu 'tạo app/web/tool' → PHẢI trả code HTML đầy đủ, chạy được.\n" +
        "5. KHÔNG trả shell/git commands.\n" +
        "6. KHÔNG dùng LaTeX hay $$.\n" +
        "7. Nếu là code → đặt trong ```<lang>...```.",
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
    "YÊU CẦU GỐC CỦA USER:",
    userRequest,
    "",
    "FORMAT BOSS GIAO:",
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

  if (webContext) {
    lines.push("", "Dữ liệu tra cứu:", webContext);
  }

  lines.push(
    "",
    "Hãy làm việc theo format và TRẢ KẾT QUẢ cho BOSS.",
    "Nếu là code → đặt trong ```html...``` — CODE CHẠY ĐƯỢC."
  );

  messages.push({ role: "user", content: lines.join("\n") });

  return messages;
}

// ============================================================
// VALIDATE CODE
// ============================================================

function validateCodeOutput(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, reason: "Không có nội dung" };
  }

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

  for (const block of codeBlocks) {
    const body = block.body.trim();
    if (isShellScript(body)) continue;

    if (block.lang === "html" || block.lang === "htm") {
      if (isRealHtml(body)) return { ok: true, code: body, language: "html" };
      continue;
    }

    if (block.lang === "javascript" || block.lang === "js") {
      if (isRealJavaScript(body))
        return { ok: true, code: body, language: "javascript" };
      continue;
    }

    if (block.lang === "python" || block.lang === "py") {
      if (isRealPython(body)) return { ok: true, code: body, language: "python" };
      continue;
    }
  }

  if (codeBlocks.some((b) => isShellScript(b.body))) {
    return {
      ok: false,
      reason:
        "Lính trả về shell/git commands — cần trả về code chạy được (HTML/JS/Python)",
    };
  }

  return { ok: false, reason: "Code block không hợp lệ hoặc không chạy được" };
}

function isShellScript(body) {
  const s = body.toLowerCase();
  const patterns = [
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

  const lines = body.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;

  const shellLines = lines.filter((l) =>
    patterns.some((p) => p.test(l))
  ).length;

  return shellLines / lines.length > 0.5;
}

function isRealHtml(body) {
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
  return /(function\s+|const\s+|let\s+|var\s+|=>|class\s+|import\s+|export\s+)/i.test(
    body
  );
}

function isRealPython(body) {
  return /(def\s+|class\s+|import\s+|from\s+|print\s*\()/i.test(body);
}

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
- Code HTML phải có <!DOCTYPE html>, <html>, <head>, <body> đầy đủ.`,
    input: "",
    constraints: [
      "Ngôn ngữ: HTML hoặc JavaScript hoặc Python",
      "KHÔNG dùng shell commands (git, npm, cd...)",
      "Code phải CHẠY ĐƯỢC",
    ],
    expectedOutput: "Code HTML/JS/Python hoàn chỉnh, chạy được ngay.",
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
// ROUTES
// ============================================================

router.post(
  "/send",
  (req, res, next) => {
    upload.array("attachments", 10)(req, res, (err) => {
      if (err) {
        logWarn("Multer upload lỗi", {
          error: err?.message || String(err),
        });
        return res.status(400).json({
          ok: false,
          message: err?.message || "Lỗi upload",
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
              dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
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
              error: e?.message || String(e),
            });
          }
        }
      }

      let bossUserRequest = String(text || "");
      if (savedAttachments.length > 0) {
        const attachDesc = savedAttachments
          .map((a, i) => `[${i + 1}] ${a.name} — ${a.type} — ${a.size} bytes`)
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