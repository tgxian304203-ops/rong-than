// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS như ChatGPT.
//
// KIẾN TRÚC:
//   1. Rồng Thần chuyển tin User → BOSS (trực tiếp)
//   2. BOSS đọc tin + lịch sử → trả về:
//      - TEXT tự nhiên → nói chuyện, hỏi lại
//      - JSON gọi tool: search_web hoặc delegate_soldier
//   3. Code parse output của BOSS:
//      - TEXT → gửi thẳng User
//      - search_web → gọi web → đưa kết quả lại cho BOSS → BOSS trả User
//      - delegate_soldier → gọi lính → Sandbox nếu code → BOSS trả User

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
// PIPELINE BOSS — NHƯ CHATGPT
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

  // ===== BƯỚC 3: BOSS ĐỌC TIN + QUYẾT ĐỊNH =====
  const bossMessages = buildBossMessages({
    userRequest,
    history: historyForBossCtx,
  });

  let bossRes = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages: bossMessages,
    temperature: 0.5,
    maxTokens: 8192,
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
      temperature: 0.5,
      maxTokens: 8192,
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
  const bossOutput = bossRes.text;

  // ===== BƯỚC 4: PARSE OUTPUT CỦA BOSS =====
  const parsed = parseBossOutput(bossOutput);

  await logInfo("BOSS: quyết định xử lý", {
    userId,
    conversationId,
    type: parsed.type,
    tool: parsed.tool || null,
  });

  // ============================================================
  // TRƯỜNG HỢP 1: BOSS TRẢ TEXT → gửi thẳng User
  // ============================================================
  if (parsed.type === "text") {
    return {
      ok: true,
      text: parsed.text,
      meta: {
        action: "reply",
        boss: bossRes.boss || bossPick.boss,
      },
    };
  }

  // ============================================================
  // TRƯỜNG HỢP 2: BOSS GỌI search_web
  // ============================================================
  if (parsed.type === "tool" && parsed.tool === "search_web") {
    const query = parsed.args?.query || userRequest;

    await logInfo("BOSS: gọi search_web", {
      userId,
      conversationId,
      query,
    });

    const web = await traWeb({
      userId,
      conversationId,
      query,
      signal,
    });

    const webContext = web.ok ? formatWebResults(web.results) : "";

    // BOSS đọc kết quả web → trả lời User
    const finalMessages = buildBossAfterWebMessages({
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
      maxTokens: 8192,
      signal,
    });

    return {
      ok: true,
      text: finalRes.ok
        ? finalRes.text
        : `Không tra được web. ${web.error || ""}`,
      meta: {
        action: "web",
        boss: bossRes.boss || bossPick.boss,
        web: { used: true, ok: web.ok },
      },
    };
  }

  // ============================================================
  // TRƯỜNG HỢP 3: BOSS GỌI delegate_soldier
  // ============================================================
  if (parsed.type === "tool" && parsed.tool === "delegate_soldier") {
    const args = parsed.args || {};
    const taskType = args.taskType || "bulk";
    const goal = args.goal || userRequest;
    const isCode =
      taskType === "code" ||
      taskType === "fix-code" ||
      args.needCode === true;

    await logInfo("BOSS: gọi delegate_soldier", {
      userId,
      conversationId,
      taskType,
      goal: goal.slice(0, 100),
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

    // ===== CHẠY LÍNH =====
    const format = {
      taskType,
      goal,
      requirements: args.requirements || [],
      constraints: args.constraints || [],
      expectedOutput: args.expectedOutput || "",
      needCode: isCode,
      subtasks: [],
      risks: [],
      qualityCriteria: [],
    };

    const result = await runSoldierWork({
      userId,
      conversationId,
      userRequest,
      bossPick,
      bossSessionId,
      format,
      historyForBoss: historyForBossCtx,
      historyForSoldier,
      needCode: isCode,
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

  // ============================================================
  // FALLBACK: output lạ → coi như text
  // ============================================================
  return {
    ok: true,
    text: parsed.text || bossOutput,
    meta: { action: "reply-fallback" },
  };
}

// ============================================================
// PROMPT BOSS — NHƯ CHATGPT
// ============================================================

function buildBossMessages({ userRequest, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là Rồng Thần — trợ lý AI thông minh, hoạt động như ChatGPT.\n" +
        "\n" +
        "BẠN CÓ THỂ:\n" +
        "1. TRÒ CHUYỆN tự nhiên với User (chào hỏi, hỏi đáp, tư vấn).\n" +
        "2. HỎI LẠI khi yêu cầu chưa rõ — để hiểu User cần gì.\n" +
        "3. GỌI CÔNG CỤ khi cần:\n" +
        "   - search_web: tra cứu thông tin mới trên internet.\n" +
        "   - delegate_soldier: giao việc cho model khác (viết code, viết văn dài, phân tích lớn).\n" +
        "\n" +
        "CÁCH TRẢ LỜI:\n" +
        "\n" +
        "【Nếu chỉ TRÒ CHUYỆN / HỎI LẠI / TRẢ LỜI ĐƠN GIẢN】\n" +
        "→ Trả về TEXT tự nhiên (tiếng Việt), không cần JSON.\n" +
        "Ví dụ: \"Xin chào! Tôi có thể giúp gì cho bạn?\"\n" +
        "Ví dụ: \"Để tôi làm rõ: bạn muốn web bán gì? Bao nhiêu trang?\"\n" +
        "\n" +
        "【Nếu cần TRA WEB】\n" +
        "→ Trả về DUY NHẤT 1 JSON:\n" +
        "{\"tool\": \"search_web\", \"args\": {\"query\": \"câu query\"}}\n" +
        "\n" +
        "【Nếu cần GIAO VIỆC CHO MODEL KHÁC】\n" +
        "→ Trả về DUY NHẤT 1 JSON:\n" +
        "{\n" +
        "  \"tool\": \"delegate_soldier\",\n" +
        "  \"args\": {\n" +
        "    \"taskType\": \"code|bulk|fix-code|summary|research|analysis|read-long-doc\",\n" +
        "    \"goal\": \"mô tả nhiệm vụ cụ thể cho model khác\",\n" +
        "    \"requirements\": [\"yêu cầu cụ thể\"],\n" +
        "    \"constraints\": [\"ràng buộc\"],\n" +
        "    \"expectedOutput\": \"kết quả mong đợi\",\n" +
        "    \"needCode\": true/false\n" +
        "  }\n" +
        "}\n" +
        "\n" +
        "QUY TẮC:\n" +
        "- Chào hỏi, hỏi thăm → TEXT.\n" +
        "- Yêu cầu mơ hồ → HỎI LẠI bằng TEXT.\n" +
        "- Cần thông tin mới → search_web.\n" +
        "- Cần viết code/văn dài → delegate_soldier.\n" +
        "- Có từ 'tạo' → taskType='code'.\n" +
        "- Có từ 'viết' → taskType='bulk'.\n" +
        "\n" +
        "KHÔNG dùng LaTeX hay $$. KHÔNG giải thích thêm ngoài JSON khi gọi tool.",
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
// BOSS SAU KHI TRA WEB
// ============================================================

function buildBossAfterWebMessages({ userRequest, webContext, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là Rồng Thần. Bạn vừa tra web xong.\n" +
        "Đọc dữ liệu web → trả lời User tự nhiên bằng tiếng Việt.\n" +
        "KHÔNG nhắc đến 'công cụ', 'tra web', 'search'.\n" +
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
// PARSE OUTPUT CỦA BOSS
// ============================================================

function parseBossOutput(text) {
  if (!text || typeof text !== "string") {
    return { type: "text", text: "(Không có nội dung)" };
  }

  // Bỏ ```json ... ``` nếu có
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  // Tìm JSON đầu tiên
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(s.slice(start, end + 1));

      // Có tool → gọi công cụ
      if (obj.tool) {
        return {
          type: "tool",
          tool: obj.tool,
          args: obj.args || {},
        };
      }
    } catch {
      /* không phải JSON → xử lý như text */
    }
  }

  // Text tự nhiên
  return { type: "text", text: s };
}

// ============================================================
// GỌI LÍNH
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

  await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: currentGiao.taskId,
  });

  // ===== SANDBOX =====
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
// BOSS TRẢ LỜI CUỐI
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
        "Bạn là Rồng Thần — trợ lý AI.\n" +
        "Bạn vừa nhận kết quả từ model khác (đã làm việc).\n" +
        "Hãy đọc kết quả → trả lời User tự nhiên, thân thiện.\n" +
        "\n" +
        "QUY TẮC:\n" +
        "1. Tiếng Việt tự nhiên.\n" +
        "2. KHÔNG nhắc 'model khác', 'lính', 'giao việc', 'Sandbox'.\n" +
        "3. KHÔNG dùng LaTeX hay $$.\n" +
        "4. Nếu kết quả là CODE và Sandbox PASS → trình bày code trong ```<lang>...``` đầy đủ.\n" +
        "5. Nếu Sandbox FAIL → thông báo User chưa qua kiểm thử, gợi ý 'Sửa tiếp'.\n" +
        "6. Nếu kết quả là VĂN BẢN → trình bày văn bản hoàn chỉnh.\n" +
        "7. Không bịa thêm ngoài kết quả.",
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
    "KẾT QUẢ ĐÃ LÀM:",
    "```",
    soldierOutput || "(không có output)",
    "```",
    "",
    `SANDBOX: ${sandboxStatus}`,
  ];

  if (isCode) {
    lines.push(`NGÔN NGỮ: ${language}`);
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

  lines.push("", "Viết câu trả lời HOÀN CHỈNH cho User.");

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

  if (res.ok && res.text) return res.text;

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
    return `✅ Code đã vượt qua kiểm thử.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\``;
  }

  if (resumeAvailable) {
    return `⚠ Code chưa vượt qua kiểm thử.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\`\n\nBấm **🔧 Sửa tiếp** để tiếp tục.`;
  }

  return `\`\`\`${language}\n${soldierOutput}\n\`\`\``;
}

// ============================================================
// MESSAGES CHO LÍNH
// ============================================================

function buildSoldierMessages({ format, history = [], userRequest, webContext }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là model được giao việc.\n" +
        "Nhiệm vụ: LÀM VIỆC theo format, TRẢ KẾT QUẢ.\n" +
        "\n" +
        "QUY TẮC:\n" +
        "1. Đọc kỹ format.\n" +
        "2. Làm việc: viết code / viết văn / phân tích.\n" +
        "3. Nếu tạo app/web → PHẢI trả code HTML đầy đủ, chạy được.\n" +
        "4. KHÔNG trả shell/git commands.\n" +
        "5. KHÔNG dùng LaTeX hay $$.\n" +
        "6. Nếu code → đặt trong ```<lang>...```.",
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
    "YÊU CẦU GỐC:",
    userRequest,
    "",
    "FORMAT GIAO VIỆC:",
    format.goal,
    "",
    `Loại: ${format.taskType}`,
  ];

  if (format.requirements?.length) {
    lines.push("", "Yêu cầu:");
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

  lines.push("", "Làm việc theo format. Nếu code → ```html...``` chạy được.");

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
    return { ok: false, reason: "Không có code block" };
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
      reason: "Trả về shell/git commands — cần code chạy được",
    };
  }

  return { ok: false, reason: "Code block không hợp lệ" };
}

function isShellScript(body) {
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
    goal: `LẦN TRƯỚC BẠN ĐÃ TRẢ SAI LOẠI. Hãy trả lại.

Lý do: ${reason}

Yêu cầu GỐC:
${originalFormat.goal}

QUY TẮC:
- CODE HTML/JS/PYTHON CHẠY ĐƯỢC — không shell script.
- KHÔNG git, npm, cd, mkdir.
- HTML có <!DOCTYPE html>, <html>, <head>, <body>.`,
    input: "",
    constraints: [
      "Ngôn ngữ: HTML/JavaScript/Python",
      "KHÔNG shell commands",
      "Code CHẠY ĐƯỢC",
    ],
    expectedOutput: "Code hoàn chỉnh, chạy được.",
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
// CHUNKED
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

  for (let i = 0; i < chunks.length; i++) {
    const chunkReq = `[PHẦN ${i + 1}/${chunks.length}]\n${chunks[i]}`;

    const format = {
      taskType: "code",
      goal: `Hoàn thành phần ${i + 1}/${chunks.length}: ${chunks[i].slice(0, 200)}`,
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

    outputs.push(
      `[Phần ${i + 1}]\n\`\`\`${lang}\n${loop.finalCode || code}\n\`\`\``
    );
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
      ? `✅ Code đã vượt qua kiểm thử cuối.\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\``
      : `⚠ Code ghép chưa qua kiểm thử.\n\n\`\`\`${lastLanguage}\n${finalLoop.finalCode}\n\`\`\`\n\nBấm **🔧 Sửa tiếp** để tiếp tục.`;
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