// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS như ChatGPT.
// Vòng lặp Sandbox: lặp TỚI KHI PASS hoặc hết 5 phút → trả code tạm + nút "Sửa tiếp".

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

import { nhanYeuCau as gwNhanYeuCau } from "../gateway/nhan-yeu-cau.js";
import { chuyenYeuCauChoBoss } from "../gateway/chuyen-yeu-cau-cho-boss.js";
import { nhanKetQuaTuBoss } from "../gateway/nhan-ket-qua-tu-boss.js";
import { traKetQuaChoUser } from "../gateway/tra-ket-qua-cho-user.js";

import { nhanYeuCau as bossNhanYeuCau } from "../boss/nhan-yeu-cau.js";
import { traWeb, formatWebResults } from "../boss/tra-web.js";
import { giaoFormat } from "../boss/giao-format.js";
import { nhanKetQuaLinh } from "../boss/nhan-ket-qua-linh.js";

import { chonBossTheoYeuCau } from "../dai-nao/chon-boss-theo-yeu-cau.js";
import { goiBoss } from "../dai-nao/goi-boss.js";
import { goiBossMoi } from "../dai-nao/goi-boss-moi.js";
import {
  banGiaoTrangThai,
  buildHandoffPrompt,
} from "../dai-nao/ban-giao-trang-thai.js";

import { goiLinh } from "../tieu-nao/goi-linh.js";
import { chayKiemThu } from "../sandbox/chay-kiem-thu.js";
import { chunkText } from "../utils/chunker.js";
import { countTokens, countMessagesTokens } from "../utils/token-counter.js";

import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const HISTORY_FOR_BOSS = 500;
const HISTORY_FOR_SOLDIER = 400;

// ============================================================
// NGÂN SÁCH THỜI GIAN CHO VÒNG LẶP SANDBOX
// ============================================================
// Lặp tới khi PASS hoặc hết thời gian → trả code tạm + nút "Sửa tiếp".
const SANDBOX_TIME_BUDGET_MS = 5 * 60 * 1000; // 5 phút

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
  const recv = await bossNhanYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!recv.ok) return { ok: false, error: recv.error };

  const history = await loadConversationHistory(conversationId, HISTORY_FOR_BOSS);
  const historyCtx = history.slice(0, -1);

  // Đọc code mới nhất
  let currentCode = null;
  try {
    const artifact = await getLatestCodeArtifact(conversationId);
    if (artifact && artifact.code) {
      currentCode = {
        code: artifact.code,
        language: artifact.language || "html",
        version: artifact.version || 1,
      };
    }
  } catch {
    /* bỏ qua */
  }

  await logInfo("BOSS: đọc ngữ cảnh", {
    userId,
    conversationId,
    historyCount: historyCtx.length,
    hasCode: !!currentCode,
    codeVersion: currentCode?.version || 0,
  });

  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  const bossMessages = buildBossMessages({
    userRequest,
    history: historyCtx,
    currentCode,
  });

  let bossRes = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages: bossMessages,
    temperature: 0.6,
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
      temperature: 0.6,
      maxTokens: 8192,
      signal,
    });
  }

  if (!bossRes.ok || !bossRes.text) {
    return { ok: false, error: bossRes.error || "BOSS không trả lời được" };
  }

  const bossSessionId = bossRes.session ? String(bossRes.session._id) : null;
  const parsed = parseBossOutput(bossRes.text);

  await logInfo("BOSS: quyết định", {
    userId,
    conversationId,
    type: parsed.type,
    tool: parsed.tool || null,
  });

  // ===== TEXT =====
  if (parsed.type === "text") {
    return {
      ok: true,
      text: parsed.text,
      meta: { action: "reply", boss: bossRes.boss || bossPick.boss },
    };
  }

  // ===== SEARCH_WEB =====
  if (parsed.type === "tool" && parsed.tool === "search_web") {
    const query = parsed.args?.query || userRequest;

    const web = await traWeb({ userId, conversationId, query, signal });
    const webContext = web.ok ? formatWebResults(web.results) : "";

    const finalMessages = buildBossAfterWebMessages({
      userRequest,
      webContext,
      history: historyCtx,
    });

    const finalRes = await goiBoss({
      userId,
      conversationId,
      boss: bossPick.boss,
      candidates: bossPick.candidates,
      messages: finalMessages,
      temperature: 0.6,
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

  // ===== DELEGATE_SOLDIER =====
  if (parsed.type === "tool" && parsed.tool === "delegate_soldier") {
    const args = parsed.args || {};
    const taskType = args.taskType || "bulk";
    const goal = args.goal || userRequest;
    const isCode =
      taskType === "code" ||
      taskType === "fix-code" ||
      args.needCode === true;

    const requestTokens = countTokens(userRequest);
    if (requestTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) {
      return await runChunkedDelegate({
        userId,
        conversationId,
        userRequest,
        bossPick,
        bossSessionId,
        historyCtx,
        history,
        signal,
      });
    }

    const format = {
      taskType,
      goal,
      requirements: args.requirements || [],
      constraints: args.constraints || [],
      expectedOutput: args.expectedOutput || "",
      needCode: isCode,
      currentCode: currentCode || null,
      isModify: !!currentCode,
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
      currentCode,
      history,
      needCode: isCode,
      signal,
    });

    if (!result.ok) return result;

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
      history: historyCtx,
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

  // ===== FALLBACK =====
  return {
    ok: true,
    text: parsed.text || bossRes.text,
    meta: { action: "reply-fallback" },
  };
}

// ============================================================
// PROMPT BOSS
// ============================================================

function buildBossMessages({ userRequest, history = [], currentCode = null }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là Rồng Thần — trợ lý AI thông minh, hoạt động tự nhiên như ChatGPT.\n" +
        "\n" +
        "TÍNH CÁCH:\n" +
        "- Suy nghĩ trước khi hành động.\n" +
        "- Thân thiện, tự nhiên.\n" +
        "- Hỏi lại khi chưa rõ — không đoán mò.\n" +
        "- Hiểu ngữ cảnh từ lịch sử.\n" +
        "\n" +
        "BẠN CÓ THỂ:\n" +
        "1. TRÒ CHUYỆN tự nhiên.\n" +
        "2. HỎI LẠI khi chưa hiểu rõ.\n" +
        "3. GỌI CÔNG CỤ:\n" +
        "   - search_web: tra cứu internet.\n" +
        "   - delegate_soldier: giao việc (viết code, viết văn, sửa code).\n" +
        "\n" +
        "CÁCH SUY NGHĨ:\n" +
        "Bước 1 — User muốn gì?\n" +
        "- Chào hỏi → trả lời tự nhiên.\n" +
        "- Hỏi thông tin mới → search_web.\n" +
        "- Yêu cầu làm → xét Bước 2.\n" +
        "\n" +
        "Bước 2 — Yêu cầu đã đủ rõ chưa?\n" +
        "- Chưa rõ → HỎI LẠI.\n" +
        "- Đã rõ → delegate_soldier.\n" +
        "\n" +
        "Bước 3 — Nếu là sửa/thay đổi:\n" +
        "- Có code hiện tại → delegate với taskType='fix-code'.\n" +
        "- KHÔNG viết lại từ đầu khi user chỉ sửa 1 phần.\n" +
        "\n" +
        "CÁCH TRẢ LỜI:\n" +
        "\n" +
        "【Chat / Hỏi lại — text tự nhiên】\n" +
        "\n" +
        "【Tra web — JSON】\n" +
        "{\"tool\": \"search_web\", \"args\": {\"query\": \"...\"}}\n" +
        "\n" +
        "【Giao việc — JSON】\n" +
        "{\n" +
        "  \"tool\": \"delegate_soldier\",\n" +
        "  \"args\": {\n" +
        "    \"taskType\": \"code|bulk|fix-code|summary|research|analysis\",\n" +
        "    \"goal\": \"mô tả chi tiết\",\n" +
        "    \"requirements\": [\"...\"],\n" +
        "    \"constraints\": [\"...\"],\n" +
        "    \"expectedOutput\": \"...\",\n" +
        "    \"needCode\": true/false\n" +
        "  }\n" +
        "}\n" +
        "\n" +
        "QUY TẮC:\n" +
        "- KHÔNG có quy tắc cứng. TỰ SUY NGHĨ như ChatGPT.\n" +
        "- Chưa rõ → hỏi lại.\n" +
        "- Sửa → fix-code, không viết lại.\n" +
        "- KHÔNG dùng LaTeX hay $$.\n" +
        "- Chỉ trả JSON khi gọi tool. Còn lại text tự nhiên.",
    },
  ];

  for (const m of history) {
    if (!m.text || !m.text.trim()) continue;
    messages.push({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    });
  }

  if (currentCode) {
    messages.push({
      role: "user",
      content:
        `[NGỮ CẢNH]\n` +
        `Đang có code v${currentCode.version} (${currentCode.language}).\n` +
        `Nếu User muốn SỬA → taskType='fix-code'.`,
    });
  }

  messages.push({ role: "user", content: userRequest });
  return messages;
}

function buildBossAfterWebMessages({ userRequest, webContext, history = [] }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là Rồng Thần. Vừa tra web xong.\n" +
        "Đọc dữ liệu → trả lời User tự nhiên bằng tiếng Việt.\n" +
        "KHÔNG nhắc 'công cụ', 'tra web'.\n" +
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
      webContext || "(không có)",
      "",
      "Trả lời User dựa trên dữ liệu trên.",
    ].join("\n"),
  });

  return messages;
}

function parseBossOutput(text) {
  if (!text || typeof text !== "string") {
    return { type: "text", text: "(Không có nội dung)" };
  }

  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(s.slice(start, end + 1));
      if (obj.tool) {
        return { type: "tool", tool: obj.tool, args: obj.args || {} };
      }
    } catch {
      /* không phải JSON */
    }
  }

  return { type: "text", text: s };
}

// ============================================================
// GỌI LÍNH — BOSS ĐIỀU KHIỂN VÒNG LẶP SỬA
// ============================================================

async function runSoldierWork({
  userId,
  conversationId,
  userRequest,
  bossPick,
  bossSessionId,
  format,
  currentCode,
  history,
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
        history.slice(-HISTORY_FOR_SOLDIER).map((m) => ({
          role: m.role,
          content: m.text,
        }))
      ),
  });
  if (!giao.ok) return { ok: false, error: giao.error };

  let currentGiao = giao;
  let soldierOutput = "";
  let language = format.language || currentCode?.language || "html";
  let initialCode = "";
  let sandboxStatus = "not_run";
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;
  let attempt = 0;
  const MAX_SOLDIER_ATTEMPTS = 3; // chỉ giới hạn cho "gọi lính ban đầu" khi lính trả sai loại
  let linh = null;

  const soldierMessages = buildSoldierMessages({
    format,
    history: history.slice(-HISTORY_FOR_SOLDIER),
    userRequest,
    currentCode,
  });

  // ===== GỌI LÍNH BAN ĐẦU (tối đa 3 lần nếu lính trả sai loại) =====
  while (attempt < MAX_SOLDIER_ATTEMPTS) {
    attempt += 1;

    await logInfo(`BOSS: gọi lính — lần thử ${attempt}/${MAX_SOLDIER_ATTEMPTS}`, {
      userId,
      conversationId,
      needCode,
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
      await logWarn("BOSS: lính thất bại", { attempt, error: linh.error });
      if (attempt >= MAX_SOLDIER_ATTEMPTS) {
        return {
          ok: false,
          error: linh.error || "Lính không hoàn thành",
          errorHistory: linh.errorHistory,
        };
      }
      continue;
    }

    soldierOutput = linh.text || "";

    if (!needCode) break;

    const validation = validateCodeOutput(soldierOutput);
    if (!validation.ok) {
      await logWarn(`BOSS: lính trả sai loại (lần ${attempt})`, {
        reason: validation.reason,
      });

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
        tokens: countTokens(userRequest),
      });
      if (newGiao.ok) currentGiao = newGiao;

      continue;
    }

    language = validation.language || "html";
    initialCode = validation.code || "";
    break;
  }

  await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: currentGiao.taskId,
  });

  // ============================================================
  // VÒNG LẶP SANDBOX — LẶP TỚI KHI PASS HOẶC HẾT 5 PHÚT
  // ============================================================
  if (needCode && initialCode) {
    const startTime = Date.now();
    let iteration = 0;

    while (true) {
      // ===== KIỂM TRA HẾT NGÂN SÁCH =====
      if (Date.now() - startTime > SANDBOX_TIME_BUDGET_MS) {
        await logWarn("BOSS: HẾT ngân sách 5 phút — trả code tạm + nút Sửa tiếp", {
          userId,
          conversationId,
          iterations: iteration,
        });
        resumeAvailable = true;
        break;
      }

      iteration += 1;

      await logInfo(`BOSS: kiểm Sandbox — vòng ${iteration}`, {
        userId,
        conversationId,
        elapsedMs: Date.now() - startTime,
      });

      const testRes = await chayKiemThu({
        userId,
        conversationId,
        language,
        code: initialCode,
      });

      sandboxStatus = testRes.ok ? "passed" : "failed";
      sandboxMeta = {
        status: testRes.status,
        runId: testRes.runId,
        attempts: iteration,
      };

      // ===== PASS → DỪNG =====
      if (testRes.ok) {
        await logInfo("BOSS: Sandbox PASS — dừng vòng lặp", {
          userId,
          conversationId,
          iterations: iteration,
        });
        resumeAvailable = false;
        break;
      }

      // ===== FAIL → BOSS sửa =====
      const lastError = testRes.stderr || testRes.error || "Không rõ";

      await logWarn(`BOSS: Sandbox FAIL vòng ${iteration}`, {
        userId,
        conversationId,
        error: lastError.slice(0, 200),
      });

      // BOSS viết format sửa
      const bossFixMessages = buildBossFixMessages({
        userRequest,
        failedCode: initialCode,
        stderr: lastError,
        language,
        attempt: iteration,
      });

      const bossFixRes = await goiBoss({
        userId,
        conversationId,
        boss: bossPick.boss,
        candidates: bossPick.candidates,
        messages: bossFixMessages,
        temperature: 0.4,
        maxTokens: 4096,
        signal,
      });

      if (!bossFixRes.ok || !bossFixRes.text) {
        await logWarn("BOSS: không viết được format sửa", {
          error: bossFixRes.error,
        });
        resumeAvailable = true;
        break;
      }

      const fixFormat = parseBossFixFormat(
        bossFixRes.text,
        format,
        iteration,
        lastError
      );

      // Gọi lính sửa
      const fixGiao = await giaoFormat({
        userId,
        conversationId,
        bossSessionId,
        format: fixFormat,
        tokens: countTokens(userRequest),
      });
      if (!fixGiao.ok) {
        resumeAvailable = true;
        break;
      }

      const fixSoldierMessages = buildSoldierMessages({
        format: fixFormat,
        history: [],
        userRequest,
        currentCode: { code: initialCode, language, version: iteration },
      });

      const fixLinh = await goiLinh({
        userId,
        taskId: fixGiao.taskId,
        soldier: fixGiao.soldier,
        candidates: fixGiao.candidates,
        messages: fixSoldierMessages,
        payload: fixFormat,
        temperature: 0.3,
        maxTokens: 8192,
        signal,
        taskType: fixGiao.taskType,
      });

      if (!fixLinh.ok || !fixLinh.text) {
        await logWarn("BOSS: lính sửa thất bại — thử vòng tiếp", {
          error: fixLinh.error,
        });
        continue;
      }

      const validation = validateCodeOutput(fixLinh.text);
      if (validation.ok) {
        initialCode = validation.code;
        language = validation.language || language;
      } else {
        initialCode = fixLinh.text;
      }
      // → tiếp tục vòng lặp — kiểm Sandbox lại
    }

    // Lưu code cuối
    try {
      const saved = await saveArtifact({
        userId,
        conversationId,
        language,
        code: initialCode,
        version: (currentCode?.version || 0) + 1,
      });
      codeMeta = {
        language,
        version: saved.version,
        artifactId: String(saved._id),
      };
    } catch {
      /* bỏ qua */
    }

    soldierOutput = initialCode;
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
    soldier: linh?.soldier || currentGiao.soldier,
    attempts: attempt,
  };
}

// ============================================================
// BOSS VIẾT FORMAT SỬA
// ============================================================

function buildBossFixMessages({
  userRequest,
  failedCode,
  stderr,
  language,
  attempt,
}) {
  return [
    {
      role: "system",
      content:
        "Bạn là BOSS. Code của model khác bị lỗi Sandbox.\n" +
        "Đọc lỗi + viết FORMAT cho model khác sửa.\n" +
        "\n" +
        "Trả về DUY NHẤT 1 JSON:\n" +
        "{\n" +
        "  \"goal\": \"mô tả lỗi + cách khắc phục cụ thể\",\n" +
        "  \"constraints\": [\"ràng buộc khi sửa\"],\n" +
        "  \"expectedOutput\": \"code sau khi sửa chạy được\"\n" +
        "}\n" +
        "\n" +
        "KHÔNG viết lại code. KHÔNG dùng LaTeX hay $$.",
    },
    {
      role: "user",
      content: [
        "Yêu cầu gốc:",
        userRequest,
        "",
        `Vòng sửa: ${attempt}`,
        `Ngôn ngữ: ${language}`,
        "",
        "Lỗi Sandbox:",
        "```",
        stderr.slice(0, 800),
        "```",
        "",
        "Code hiện tại:",
        "```",
        failedCode.slice(0, 1500),
        "```",
        "",
        "Viết format sửa cho model khác (JSON).",
      ].join("\n"),
    },
  ];
}

function parseBossFixFormat(text, originalFormat, attempt, error) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  let parsed = null;
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(s.slice(start, end + 1));
    } catch {
      /* ignore */
    }
  }

  return {
    taskType: "fix-code",
    goal: parsed?.goal || `Sửa lỗi: ${error.slice(0, 200)}`,
    requirements: parsed?.requirements || [],
    constraints: parsed?.constraints || [
      `Ngôn ngữ: ${originalFormat.language || "html"}`,
      "Code phải CHẠY ĐƯỢC",
    ],
    expectedOutput: parsed?.expectedOutput || "Code sửa xong, chạy được.",
    needCode: true,
    isModify: true,
    subtasks: [],
    risks: [],
    qualityCriteria: [],
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
        "Bạn là Rồng Thần. Vừa nhận kết quả.\n" +
        "Đọc kết quả → trả lời User tự nhiên, thân thiện.\n" +
        "\n" +
        "QUY TẮC:\n" +
        "1. Tiếng Việt tự nhiên.\n" +
        "2. KHÔNG nhắc 'model khác', 'lính', 'Sandbox'.\n" +
        "3. KHÔNG dùng LaTeX hay $$.\n" +
        "4. Code PASS → trình bày trong ```<lang>...``` đầy đủ.\n" +
        "5. Code FAIL → thông báo chưa PASS, gợi ý 'Sửa tiếp'.\n" +
        "6. Văn bản → trình bày hoàn chỉnh.\n" +
        "7. Không bịa thêm.",
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
    "YÊU CẦU:",
    userRequest,
    "",
    "KẾT QUẢ:",
    "```",
    soldierOutput || "(không có)",
    "```",
    "",
    `SANDBOX: ${sandboxStatus}`,
  ];

  if (isCode) lines.push(`NGÔN NGỮ: ${language}`);
  if (webContext) lines.push("", "DỮ LIỆU WEB:", webContext);
  if (resumeAvailable) {
    lines.push("", "LƯU Ý: Code chưa PASS — thông báo User có thể bấm 'Sửa tiếp'.");
  }

  lines.push("", "Viết câu trả lời hoàn chỉnh cho User.");

  messages.push({ role: "user", content: lines.join("\n") });

  const res = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    candidates: bossPick.candidates,
    messages,
    temperature: 0.6,
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

function buildSoldierMessages({
  format,
  history = [],
  userRequest,
  currentCode = null,
}) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là model được giao việc.\n" +
        "LÀM VIỆC theo format, TRẢ KẾT QUẢ.\n" +
        "\n" +
        "QUY TẮC:\n" +
        "1. Nếu có CODE HIỆN TẠI → SỬA/THAY ĐỔI, KHÔNG viết lại từ đầu.\n" +
        "2. Nếu chưa có → TẠO MỚI.\n" +
        "3. Nếu tạo web → code HTML đầy đủ, chạy được.\n" +
        "4. KHÔNG trả shell/git commands.\n" +
        "5. KHÔNG dùng LaTeX hay $$.\n" +
        "6. Nếu code → ```<lang>...```.",
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
    "NHIỆM VỤ:",
    format.goal,
    "",
    `Loại: ${format.taskType}`,
  ];

  if (format.isModify) {
    lines.push("", "⚠ ĐÂY LÀ SỬA/THAY ĐỔI — KHÔNG viết lại từ đầu.");
  }

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

  if (currentCode?.code) {
    lines.push(
      "",
      `CODE HIỆN TẠI (v${currentCode.version || 0}, ${currentCode.language || "html"}):`,
      "```" + (currentCode.language || "html"),
      currentCode.code,
      "```",
      "",
      "Hãy SỬA/THAY ĐỔI code trên — KHÔNG viết lại từ đầu."
    );
  }

  lines.push("", "Làm việc. Nếu code → ```<lang>...``` chạy được.");

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
    return { ok: false, reason: "Shell/git — cần code chạy được" };
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
    goal: `LẦN TRƯỚC BẠN ĐÃ TRẢ SAI LOẠI. Hãy trả lại đúng.

Lý do: ${reason}

Yêu cầu GỐC:
${originalFormat.goal}

QUY TẮC:
- CODE HTML/JS/PYTHON CHẠY ĐƯỢC — không shell script.
- HTML có <!DOCTYPE html>, <html>, <head>, <body>.`,
    input: "",
    constraints: ["Ngôn ngữ: HTML/JavaScript/Python", "KHÔNG shell commands"],
    expectedOutput: "Code hoàn chỉnh, chạy được.",
    context: {
      attempt,
      reason,
      badOutputPreview: String(badOutput || "").slice(0, 300),
      isWrongType: true,
    },
    requirements: [],
    needCode: true,
    isModify: false,
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
  historyCtx,
  history,
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
      history: [],
      userRequest: chunkReq,
      currentCode: null,
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

    const validation = validateCodeOutput(linh.text || "");
    if (!validation.ok) {
      outputs.push(`[Phần ${i + 1}]\n${linh.text || ""}`);
      continue;
    }

    const lang = validation.language;
    const code = validation.code;
    lastLanguage = lang;
    codeChunks.push(code);
    outputs.push(`[Phần ${i + 1}]\n\`\`\`${lang}\n${code}\n\`\`\``);
  }

  let finalText = outputs.join("\n\n");
  let codeMeta = null;

  if (codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);

    try {
      const saved = await saveArtifact({
        userId,
        conversationId,
        language: lastLanguage,
        code: mergedCode,
        version: 1,
      });
      codeMeta = {
        language: lastLanguage,
        version: saved.version,
        artifactId: String(saved._id),
      };
    } catch {
      /* bỏ qua */
    }

    finalText = `Đã tạo code.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\``;
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      action: "delegate-chunked",
      code: codeMeta,
      chunked: true,
      chunkCount: chunks.length,
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

  const latest = await getLatestCodeArtifact(conversationId);
  if (!latest || !latest.code) {
    return { ok: false, error: "Không tìm thấy code để sửa tiếp." };
  }

  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  const result = await runSoldierWork({
    userId,
    conversationId,
    userRequest: "Sửa tiếp code hiện tại",
    bossPick,
    bossSessionId: null,
    format: {
      taskType: "fix-code",
      goal: "Sửa tiếp code hiện tại cho tới khi hết lỗi",
      needCode: true,
      isModify: true,
      requirements: [],
      constraints: [],
      expectedOutput: "",
      subtasks: [],
      risks: [],
      qualityCriteria: [],
    },
    currentCode: {
      code: latest.code,
      language: latest.language || "html",
      version: latest.version || 1,
    },
    history: [],
    needCode: true,
    signal,
  });

  if (!result.ok) return result;

  const finalText = await bossFinalAnswer({
    userId,
    conversationId,
    bossPick,
    userRequest: "Sửa tiếp code",
    soldierOutput: result.soldierOutput,
    isCode: true,
    language: result.language,
    sandboxStatus: result.sandboxStatus,
    resumeAvailable: result.resumeAvailable,
    webContext: "",
    history: [],
    signal,
  });

  return {
    ok: true,
    text: finalText,
    meta: {
      sandbox: result.sandboxMeta,
      code: result.codeMeta,
      resume: true,
      resumeAvailable: result.resumeAvailable,
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
        return res.status(400).json({ ok: false, message: "Thiếu conversationId" });
      }

      if (!text && files.length === 0) {
        return res.status(400).json({ ok: false, message: "Tin nhắn rỗng" });
      }

      if (!text && files.length > 0) text = "[Ảnh đính kèm]";

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