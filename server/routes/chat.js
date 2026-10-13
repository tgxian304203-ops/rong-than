// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS nói chuyện trực tiếp với User.
//
// KIẾN TRÚC:
//   1. Rồng Thần chuyển tin User → BOSS (trực tiếp)
//   2. BOSS đọc tin + quyết định:
//      - "reply"    → BOSS tự trả lời (chat, hỏi đáp)
//      - "delegate" → BOSS viết format ra lệnh cho lính
//      - "web"      → BOSS tự tra web
//   3. Nếu delegate → Tiểu Não gọi lính → lính làm → trả BOSS
//   4. Nếu code → BOSS test Sandbox → PASS/FAIL
//   5. BOSS trả kết quả cho User

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
import { traWeb, formatWebResults } from "../boss/tra-web.js";
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
// PIPELINE BOSS
// ============================================================

async function runBossPipeline({
  userId,
  conversationId,
  userRequest,
  userLabel,
  signal,
}) {
  // ===== BƯỚC 1: RỒNG THẦN NHẬN TIN =====
  const recv = await bossNhanYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!recv.ok) return { ok: false, error: recv.error };

  const historyForBoss = await loadConversationHistory(
    conversationId,
    HISTORY_FOR_BOSS
  );
  const historyForBossCtx = historyForBoss.slice(0, -1);
  const historyForSoldier = historyForBoss.slice(
    -HISTORY_FOR_SOLDIER - 1,
    -1
  );

  // ===== BƯỚC 2: CHỌN BOSS =====
  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  // ===== BƯỚC 3: BOSS ĐỌC TIN USER + QUYẾT ĐỊNH =====
  const decisionMessages = buildBossDecisionMessages({
    userRequest,
    history: historyForBossCtx,
  });

  let bossRes = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages: decisionMessages,
    temperature: 0.4,
    maxTokens: 4096,
    signal,
  });

  if (!bossRes.ok) {
    const handoff = await banGiaoTrangThai({ userId, conversationId });
    const handoffPrompt = handoff.ok ? buildHandoffPrompt(handoff.handoff) : "";
    const messagesWithHandoff = handoffPrompt
      ? [...decisionMessages, { role: "system", content: handoffPrompt }]
      : decisionMessages;

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

  if (!bossRes.ok || !bossRes.text) {
    return {
      ok: false,
      error: bossRes.error || "BOSS không trả lời được",
    };
  }

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;

  // ===== BƯỚC 4: PARSE JSON QUYẾT ĐỊNH =====
  const decision = parseBossDecision(bossRes.text);

  await logInfo("BOSS: quyết định xử lý", {
    userId,
    conversationId,
    action: decision.action,
    hasFormat: !!decision.format,
  });

  // ============================================================
  // TRƯỜNG HỢP 1: BOSS TỰ TRẢ LỜI
  // ============================================================
  if (decision.action === "reply") {
    await logInfo("BOSS: tự trả lời User", {
      userId,
      conversationId,
      replyLength: String(decision.replyText || "").length,
    });

    return {
      ok: true,
      text: decision.replyText || "(BOSS không có nội dung)",
      meta: {
        action: "reply",
        boss: bossRes.boss || bossPick.boss,
      },
    };
  }

  // ============================================================
  // TRƯỜNG HỢP 2: BOSS TRA WEB
  // ============================================================
  if (decision.action === "web") {
    await logInfo("BOSS: tự tra web", {
      userId,
      conversationId,
      query: decision.webQuery,
    });

    const web = await traWeb({
      userId,
      conversationId,
      query: decision.webQuery || userRequest,
      signal,
    });

    const webContext = web.ok ? formatWebResults(web.results) : "";

    // BOSS đọc kết quả web → trả lời User
    const finalMessages = buildBossReadWebMessages({
      userRequest,
      webContext,
      history: historyForBossCtx,
    });

    const finalRes = await goiBoss({
      userId,
      conversationId,
      boss: bossPick.boss,
      candidates: bossPick.candidates,
      messages: finalMessages,
      temperature: 0.5,
      maxTokens: 4096,
      signal,
    });

    return {
      ok: true,
      text: finalRes.ok
        ? finalRes.text
        : `Không tra được web. Lỗi: ${web.error || "không rõ"}`,
      meta: {
        action: "web",
        boss: bossRes.boss || bossPick.boss,
        web: { used: true, ok: web.ok },
      },
    };
  }

  // ============================================================
  // TRƯỜNG HỢP 3: BOSS GIAO LÍNH
  // ============================================================
  if (decision.action === "delegate") {
    if (!decision.format) {
      return { ok: false, error: "BOSS delegate nhưng thiếu format" };
    }

    await logInfo("BOSS: giao format cho lính", {
      userId,
      conversationId,
      taskType: decision.format.taskType,
    });

    // ===== CHUNK NẾU YÊU CẦU DÀI =====
    const requestTokens = countTokens(userRequest);
    if (requestTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) {
      return await runChunkedDelegate({
        userId,
        conversationId,
        userRequest,
        bossPick,
        bossSessionId,
        historyForBoss: historyForBossCtx,
        historyForSoldier,
        signal,
      });
    }

    // ===== GỌI LÍNH =====
    const result = await runSoldierWork({
      userId,
      conversationId,
      userRequest,
      bossPick,
      bossSessionId,
      format: decision.format,
      historyForBoss: historyForBossCtx,
      historyForSoldier,
      needCode: decision.format.taskType === "code" ||
        decision.format.taskType === "fix-code" ||
        decision.format.needCode === true,
      signal,
    });

    if (!result.ok) return result;

    // ===== BOSS TRẢ KẾT QUẢ CUỐI CHO USER =====
    const finalText = await bossFinalAnswer({
      userId,
      conversationId,
      bossPick,
      userRequest,
      soldierOutput: result.soldierOutput,
      isCode: result.isCode,
      language: result.language,
      sandboxStatus: result.sandboxStatus,
      resumeAvailable: result.resumeAvailable,
      webContext: "",
      history: historyForBossCtx,
      signal,
    });

    return {
      ok: true,
      text: finalText,
      meta: {
        action: "delegate",
        boss: bossRes.boss || bossPick.boss,
        soldier: result.soldier,
        sandbox: result.sandboxMeta,
        code: result.codeMeta,
        resumeAvailable: result.resumeAvailable,
        soldierAttempts: result.attempts,
      },
    };
  }

  // ===== Không rõ action =====
  return {
    ok: true,
    text: decision.replyText || "(BOSS không xác định được yêu cầu)",
    meta: { action: "unknown" },
  };
}

// ============================================================
// PROMPT: BOSS QUYẾT ĐỊNH
// ============================================================

function buildBossDecisionMessages({ userRequest, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là BOSS của Rồng Thần — model AI tiếp quản cuộc trò chuyện với User.\n" +
        "\n" +
        "NHIỆM VỤ:\n" +
        "1. Đọc tin User.\n" +
        "2. Quyết định xử lý:\n" +
        "   - action='reply'    → tự trả lời (chào hỏi, hỏi đáp, tâm sự...)\n" +
        "   - action='web'      → cần tra web → trả query\n" +
        "   - action='delegate' → cần lính làm (viết code, viết văn, phân tích...)\n" +
        "\n" +
        "QUY TẮC BẮT BUỘC:\n" +
        "- Chào hỏi, hỏi thăm, hỏi đáp đơn giản, tâm sự → action='reply'.\n" +
        "- Cần thông tin mới/thời sự → action='web'.\n" +
        "- Yêu cầu viết code/văn/phân tích → action='delegate'.\n" +
        "\n" +
        "TRẢ VỀ DUY NHẤT 1 JSON — không thêm gì khác:\n" +
        "\n" +
        "Nếu action='reply':\n" +
        '{\n  "action": "reply",\n  "replyText": "câu trả lời của bạn cho User"\n}\n' +
        "\n" +
        "Nếu action='web':\n" +
        '{\n  "action": "web",\n  "webQuery": "câu query tra web"\n}\n' +
        "\n" +
        "Nếu action='delegate':\n" +
        '{\n' +
        '  "action": "delegate",\n' +
        '  "format": {\n' +
        '    "taskType": "code|bulk|fix-code|summary|research|analysis|read-long-doc",\n' +
        '    "goal": "mô tả nhiệm vụ cho lính",\n' +
        '    "requirements": ["yêu cầu cụ thể"],\n' +
        '    "constraints": ["ràng buộc"],\n' +
        '    "expectedOutput": "kết quả mong đợi",\n' +
        '    "needCode": true/false\n' +
        '  }\n' +
        '}\n' +
        "\n" +
        "QUY TẮC PHÂN LOẠI taskType:\n" +
        "- Có từ 'tạo' → taskType = 'code' (viết web, app...)\n" +
        "- Có từ 'viết' → taskType = 'bulk' (viết văn, bài luận...)\n" +
        "- 'sửa code' → 'fix-code'.\n" +
        "\n" +
        "KHÔNG dùng LaTeX hay $$. Không thêm chữ nào ngoài JSON.",
    },
  ];

  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    });
  }

  messages.push({ role: "user", content: userRequest });

  return messages;
}

// ============================================================
// PARSE JSON QUYẾT ĐỊNH
// ============================================================

function parseBossDecision(text) {
  if (!text || typeof text !== "string") {
    return { action: "reply", replyText: "(Không có nội dung)" };
  }

  // Bỏ ```json ... ``` nếu có
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) {
    // Không phải JSON — coi như reply text
    return { action: "reply", replyText: text };
  }

  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    if (!obj.action) obj.action = "reply";
    return obj;
  } catch {
    return { action: "reply", replyText: text };
  }
}

// ============================================================
// BOSS ĐỌC KẾT QUẢ WEB
// ============================================================

function buildBossReadWebMessages({ userRequest, webContext, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là BOSS của Rồng Thần. Bạn vừa tra web xong.\n" +
        "Đọc dữ liệu web và trả lời User trực tiếp bằng tiếng Việt, tự nhiên.\n" +
        "KHÔNG nhắc đến 'web', 'tra cứu', 'công cụ'.\n" +
        "KHÔNG dùng LaTeX hay $$.\n" +
        "Trích nguồn URL nếu có.",
    },
  ];

  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    });
  }

  messages.push({
    role: "user",
    content: [
      "Yêu cầu của User:",
      userRequest,
      "",
      "Dữ liệu tra cứu:",
      webContext || "(không có dữ liệu)",
      "",
      "Hãy trả lời User dựa trên dữ liệu trên.",
    ].join("\n"),
  });

  return messages;
}

// ============================================================
// GỌI LÍNH — LÀM VIỆC THEO FORMAT
// ============================================================

async function runSoldierWork({
  userId,
  conversationId,
  userRequest,
  bossPick,
  bossSessionId,
  format,
  historyForBoss,
  historyForSoldier,
  needCode,
  signal,
}) {
  // Giao format cho Tiểu Não
  const giao = await giaoFormat({
    userId,
    conversationId,
    bossSessionId,
    format,
    tokens:
      countTokens(userRequest) +
      countMessagesTokens(
        historyForSoldier.map((m) => ({ role: m.role, content: m.text }))
      ),
  });
  if (!giao.ok) return { ok: false, error: giao.error };

  // Gọi lính
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
      needCode,
    });

    const soldierMessages = buildSoldierMessages({
      format,
      history: historyForSoldier,
      userRequest,
      webContext: "",
    });

    linh = await goiLinh({
      userId,
      taskId: currentGiao.taskId,
      soldier: currentGiao.soldier,
      candidates: currentGiao.candidates,
      messages: soldierMessages,
      payload: format,
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

    if (needCode) {
      const validation = validateCodeOutput(soldierOutput);

      if (!validation.ok) {
        await logWarn(
          `BOSS: lính trả sai loại — yêu cầu làm lại (lần ${attempt})`,
          { reason: validation.reason }
        );

        const fixFormat = buildWrongTypeFixFormat({
          originalFormat: format,
          reason: validation.reason,
          badOutput: soldierOutput,
          attempt,
        });

        const newGiao = await giaoFormat({
          userId,
          conversationId,
          bossSessionId,
          format: fixFormat,
          tokens:
            countTokens(userRequest) +
            countMessagesTokens(
              historyForSoldier.map((m) => ({
                role: m.role,
                content: m.text,
              }))
            ),
        });

        if (newGiao.ok) {
          currentGiao = newGiao;
          format = fixFormat;
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
  await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: currentGiao.taskId,
  });

  // ===== SANDBOX NẾU LÀ CODE =====
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;
  let sandboxStatus = "not_run";

  if (needCode && initialCode) {
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

  return {
    ok: true,
    soldierOutput,
    isCode: needCode,
    language,
    sandboxStatus,
    resumeAvailable,
    sandboxMeta,
    codeMeta,
    soldier: linh.soldier || currentGiao.soldier,
    attempts: attempt,
  };
}

// ============================================================
// BOSS VIẾT CÂU TRẢ LỜI CUỐI
// ============================================================

async function bossFinalAnswer({
  userId,
  conversationId,
  bossPick,
  userRequest,
  soldierOutput,
  isCode,
  language,
  sandboxStatus,
  resumeAvailable,
  webContext,
  history = [],
  signal,
}) {
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
        "4. Nếu kết quả là CODE và Sandbox PASS → trình bày code trong ```<lang>...``` đầy đủ.\n" +
        "5. Nếu Sandbox FAIL → thông báo User chưa qua kiểm thử, gợi ý 'Sửa tiếp'.\n" +
        "6. Nếu kết quả là VĂN BẢN → trình bày văn bản hoàn chỉnh.\n" +
        "7. Không tự bịa thêm thông tin ngoài kết quả lính.",
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
    lines.push("", "DỮ LIỆU WEB:", webContext);
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

  const res = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages,
    temperature: 0.5,
    maxTokens: 8192,
    signal,
  });

  if (res.ok && res.text) {
    return res.text;
  }

  // Fallback
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

  if (!isCode) return soldierOutput;

  if (sandboxStatus === "passed") {
    return `✅ Code đã vượt qua kiểm thử Sandbox.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\``;
  }

  if (resumeAvailable) {
    return `⚠ Code chưa vượt qua kiểm thử Sandbox.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\`\n\nBấm nút **🔧 Sửa tiếp** để tiếp tục.`;
  }

  return `\`\`\`${language}\n${soldierOutput}\n\`\`\``;
}

// ============================================================
// MESSAGES CHO LÍNH — LÍNH LÀM VIỆC THEO FORMAT
// ============================================================

function buildSoldierMessages({ format, history = [], userRequest, webContext }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là lính — model AI được BOSS giao việc.\n" +
        "Nhiệm vụ: LÀM VIỆC theo format, TRẢ KẾT QUẢ cho BOSS.\n" +
        "\n" +
        "QUY TẮC:\n" +
        "1. Nhận format — đọc kỹ nhiệm vụ.\n" +
        "2. Làm việc: viết code / viết văn / phân tích theo yêu cầu.\n" +
        "3. TRẢ KẾT QUẢ cho BOSS — không tự nhận là trợ lý.\n" +
        "4. Nếu yêu cầu tạo app/web → PHẢI trả code HTML đầy đủ, chạy được.\n" +
        "5. KHÔNG trả shell/git commands.\n" +
        "6. KHÔNG dùng LaTeX hay $$.\n" +
        "7. Nếu code → đặt trong ```<lang>...```.",
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

  if (format.requirements?.length) {
    lines.push("", "Yêu cầu cụ thể:");
    for (const r of format.requirements) lines.push(`- ${r}`);
  }

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
      if (isRealPython(body))
        return { ok: true, code: body, language: "python" };
      continue;
    }
  }

  if (codeBlocks.some((b) => isShellScript(b.body))) {
    return {
      ok: false,
      reason:
        "Lính trả shell/git commands — cần trả code chạy được (HTML/JS/Python)",
    };
  }

  return { ok: false, reason: "Code block không hợp lệ" };
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

Yêu cầu GỐC:
${originalFormat.goal}

QUY TẮC:
- Trả về CODE HTML/JS/PYTHON CHẠY ĐƯỢC — không shell script.
- KHÔNG trả git, npm, cd, mkdir.
- HTML phải có <!DOCTYPE html>, <html>, <head>, <body> đầy đủ.`,
    input: "",
    constraints: [
      "Ngôn ngữ: HTML hoặc JavaScript hoặc Python",
      "KHÔNG shell commands",
      "Code CHẠY ĐƯỢC",
    ],
    expectedOutput: "Code HTML/JS/Python hoàn chỉnh, chạy được.",
    context: {
      attempt,
      reason,
      badOutputPreview: String(badOutput || "").slice(0, 300),
      isWrongType: true,
    },
    requirements: [],
    subtasks: [],
    risks: [],
    qualityCriteria: [],
  };
}

// ============================================================
// CHUNKED DELEGATE
// ============================================================

async function runChunkedDelegate({
  userId,
  conversationId,
  userRequest,
  bossPick,
  bossSessionId,
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
  let lastGiao = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunkReq = `[PHẦN ${i + 1}/${chunks.length}]\n${chunks[i]}`;

    // BOSS viết format cho phần này
    const format = {
      taskType: "code",
      goal: `Hoàn thành phần ${i + 1}/${chunks.length} của yêu cầu: ${chunks[i].slice(0, 200)}`,
      needCode: true,
      requirements: [],
      constraints: [],
      expectedOutput: "",
      subtasks: [],
      risks: [],
      qualityCriteria: [],
    };

    const giao = await giaoFormat({
      userId,
      conversationId,
      bossSessionId,
      format,
      tokens: countTokens(chunkReq),
    });
    if (!giao.ok) continue;
    lastGiao = giao;

    const soldierMessages = buildSoldierMessages({
      format,
      history: historyForSoldier,
      userRequest: chunkReq,
      webContext: "",
    });

    const linh = await goiLinh({
      userId,
      taskId: giao.taskId,
      soldier: giao.soldier,
      candidates: giao.candidates,
      messages: soldierMessages,
      payload: format,
      temperature: 0.3,
      maxTokens: 8192,
      signal,
      taskType: giao.taskType,
    });

    if (!linh.ok) continue;

    const partOutput = linh.text || "";
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
      outputs.push(`[Phần ${i + 1}]\n\`\`\`${lang}\n${loop.finalCode}\n\`\`\``);
    } else {
      outputs.push(
        `[Phần ${i + 1}]\n\`\`\`${lang}\n${loop.finalCode || code}\n\`\`\``
      );
    }
  }

  let finalText = outputs.join("\n\n");
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;

  if (codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);

    const finalLoop = await vongLapSua({
      userId,
      conversationId,
      bossSessionId,
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

    finalText = finalLoop.ok
      ? `✅ Code đã vượt qua kiểm thử Sandbox cuối.\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\``
      : `⚠ Code ghép chưa qua kiểm thử cuối.\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\`\n\nBấm **🔧 Sửa tiếp** để tiếp tục.`;
    resumeAvailable = !finalLoop.ok;
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      action: "delegate-chunked",
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
      error: "Không tìm thấy code để sửa tiếp.",
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

  const finalText = await bossFinalAnswer({
    userId,
    conversationId,
    bossPick,
    userRequest: goal,
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
// ROUTES
// ============================================================

router.post(
  "/send",
  (req, res, next) => {
    upload.array("attachments", 10)(req, res, (err) => {
      if (err) {
        logWarn("Multer upload lỗi", { error: err?.message || String(err) });
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