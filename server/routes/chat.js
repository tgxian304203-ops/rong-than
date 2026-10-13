// server/routes/chat.js
// Nhiệm vụ: API chat — BOSS như ChatGPT.
// BOSS hiểu nguyên tắc, tự quyết định. Code → Sandbox → báo PASS/FAIL cho User.

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

import { goiBoss } from "../dai-nao/goi-boss.js";
import { goiBossMoi } from "../dai-nao/goi-boss-moi.js";

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
const SANDBOX_TIME_BUDGET_MS = 5 * 60 * 1000;

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

  const bossMessages = buildBossMessages({
    userRequest,
    history: historyCtx,
    currentCode,
  });

  let bossRes = await goiBoss({
    userId,
    conversationId,
    taskType: "call-boss",
    messages: bossMessages,
    temperature: 0.6,
    maxTokens: 8192,
    signal,
  });

  if (!bossRes.ok) {
    bossRes = await goiBossMoi({
      userId,
      conversationId,
      oldSession: null,
      messages: bossMessages,
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

  // ===== TEXT (chat / hỏi lại) =====
  if (parsed.type === "text") {
    return {
      ok: true,
      text: parsed.text,
      meta: { action: "reply" },
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
      taskType: "call-boss",
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
        web: { used: true, ok: web.ok },
      },
    };
  }

  // ===== DELEGATE_SOLDIER =====
  if (parsed.type === "tool" && parsed.tool === "delegate_soldier") {
    const args = parsed.args || {};
    const taskType = args.taskType || "bulk";
    const goal = args.goal || userRequest;

    const requestTokens = countTokens(userRequest);
    if (requestTokens > LIMITS.CONTEXT_TOKEN_GEMINI_MAX) {
      return await runChunkedDelegate({
        userId,
        conversationId,
        userRequest,
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
      needCode: taskType === "code" || taskType === "fix-code",
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
      bossSessionId,
      format,
      currentCode,
      history,
      signal,
    });

    if (!result.ok) return result;

    const finalText = await bossFinalAnswer({
      userId,
      conversationId,
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
        soldier: result.soldier,
        sandbox: result.sandboxMeta,
        code: result.codeMeta,
        resumeAvailable: result.resumeAvailable,
        soldierAttempts: result.attempts,
      },
    };
  }

  return {
    ok: true,
    text: parsed.text || bossRes.text,
    meta: { action: "reply-fallback" },
  };
}

// ============================================================
// PROMPT BOSS — NGUYÊN TẮC, KHÔNG TỪ KHÓA CỨNG
// ============================================================

function buildBossMessages({ userRequest, history = [], currentCode = null }) {
  const messages = [
    {
      role: "system",
      content:
        "Bạn là Rồng Thần — BOSS, trợ lý AI thông minh, hoạt động tự nhiên như ChatGPT.\n" +
        "\n" +
        "BẠN LÀ ÔNG CHỦ — CÓ ĐỘI NGŨ:\n" +
        "\n" +
        "1. 🧠 LÍNH — model khác chuyên làm việc NẶNG:\n" +
        "   - Viết code web/app/tool.\n" +
        "   - Viết văn dài, bài luận, phân tích lớn.\n" +
        "   - Sửa code khi lỗi.\n" +
        "\n" +
        "2. 🌐 WEB — công cụ tra cứu internet:\n" +
        "   - Tin tức mới, thông tin thời sự.\n" +
        "   - Dữ liệu cập nhật.\n" +
        "\n" +
        "3. 🧪 SANDBOX — công cụ kiểm thử code:\n" +
        "   - Khi lính trả code → tự động chạy.\n" +
        "   - PASS → báo User 'Code đã vượt qua kiểm thử'.\n" +
        "   - FAIL → báo User 'Code chưa PASS, có thể bấm Sửa tiếp'.\n" +
        "   - Vòng lặp sửa cho tới khi PASS.\n" +
        "\n" +
        "NGUYÊN TẮC HOẠT ĐỘNG:\n" +
        "\n" +
        "1. CHAT với User để HIỂU rõ yêu cầu.\n" +
        "   - Chào hỏi → trả lời tự nhiên.\n" +
        "   - Chưa rõ → HỎI LẠI.\n" +
        "   - Đang thảo luận → tiếp tục chat.\n" +
        "\n" +
        "2. Khi User ĐÃ QUYẾT ĐỊNH làm (bạn TỰ ĐỌC ngữ cảnh để hiểu):\n" +
        "   - Cần sản phẩm (code/văn) → giao LÍNH.\n" +
        "   - Cần thông tin mới → gọi WEB.\n" +
        "\n" +
        "3. Bạn TỰ HIỂU khi nào User đã quyết định dựa vào NGỮ CẢNH — không cần từ khóa cứng.\n" +
        "   Ví dụ User nói 'làm đi', 'triển đi', 'OK', 'chốt', 'bắt đầu' — tùy ngữ cảnh.\n" +
        "   Nhưng nếu User chỉ đang mô tả / hỏi → CHƯA quyết định → tiếp tục chat.\n" +
        "\n" +
        "4. Khi có code:\n" +
        "   - Sandbox TỰ CHẠY (bạn không cần gọi).\n" +
        "   - Bạn báo User kết quả PASS/FAIL.\n" +
        "   - Nếu FAIL → hướng dẫn User bấm 'Sửa tiếp'.\n" +
        "\n" +
        "5. Khi User bảo SỬA sau khi có code:\n" +
        "   - Bạn hiểu là sửa → giao LÍNH taskType='fix-code'.\n" +
        "\n" +
        "6. Bạn KHÔNG ĐƯỢC tự viết code / văn dài — luôn giao LÍNH.\n" +
        "\n" +
        "CÁCH TRẢ LỜI:\n" +
        "\n" +
        "【Chat / Hỏi lại】→ TEXT tự nhiên.\n" +
        "Ví dụ: \"Xin chào! Tôi có thể giúp gì?\"\n" +
        "Ví dụ: \"Để tôi rõ hơn: bạn muốn web bán gì? Bao nhiêu trang?\"\n" +
        "\n" +
        "【Tra web】→ JSON:\n" +
        "{\"tool\": \"search_web\", \"args\": {\"query\": \"...\"}}\n" +
        "\n" +
        "【Giao lính】→ JSON:\n" +
        "{\n" +
        "  \"tool\": \"delegate_soldier\",\n" +
        "  \"args\": {\n" +
        "    \"taskType\": \"code|bulk|fix-code|summary|research|analysis\",\n" +
        "    \"goal\": \"mô tả chi tiết nhiệm vụ\",\n" +
        "    \"requirements\": [\"yêu cầu cụ thể\"],\n" +
        "    \"constraints\": [\"ràng buộc\"],\n" +
        "    \"expectedOutput\": \"kết quả mong đợi\"\n" +
        "  }\n" +
        "}\n" +
        "\n" +
        "KHÔNG dùng LaTeX hay $$. Chỉ trả JSON khi gọi tool.",
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
// GỌI LÍNH + SANDBOX
// ============================================================

async function runSoldierWork({
  userId,
  conversationId,
  userRequest,
  bossSessionId,
  format,
  currentCode,
  history,
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
  const MAX_SOLDIER_ATTEMPTS = 3;
  let linh = null;

  const soldierMessages = buildSoldierMessages({
    format,
    history: history.slice(-HISTORY_FOR_SOLDIER),
    userRequest,
    currentCode,
  });

  // ===== GỌI LÍNH BAN ĐẦU =====
  while (attempt < MAX_SOLDIER_ATTEMPTS) {
    attempt += 1;

    await logInfo(`BOSS: gọi lính — lần thử ${attempt}/${MAX_SOLDIER_ATTEMPTS}`, {
      userId,
      conversationId,
    });

    linh = await goiLinh({
      userId,
      taskId: currentGiao.taskId,
      taskType: currentGiao.taskType,
      messages: soldierMessages,
      payload: format,
      temperature: 0.3,
      maxTokens: 8192,
      signal,
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

    const validation = validateCodeOutput(soldierOutput);

    if (validation.ok && validation.code) {
      language = validation.language || "html";
      initialCode = validation.code;
      break;
    }

    const needsCode =
      format.taskType === "code" ||
      format.taskType === "fix-code" ||
      format.needCode === true;

    if (needsCode) {
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

    break;
  }

  await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: currentGiao.taskId,
  });

  // ===== SANDBOX — BẮT BUỘC KHI CÓ CODE =====
  if (initialCode) {
    await logInfo("BOSS: có code → Sandbox", {
      userId,
      conversationId,
      language,
      codeLength: initialCode.length,
    });

    const startTime = Date.now();
    let iteration = 0;

    while (true) {
      if (Date.now() - startTime > SANDBOX_TIME_BUDGET_MS) {
        await logWarn("BOSS: hết 5 phút → trả code + nút Sửa tiếp", {
          userId,
          conversationId,
          iterations: iteration,
        });
        resumeAvailable = true;
        break;
      }

      iteration += 1;

      await logInfo(`BOSS: Sandbox vòng ${iteration}`, {
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

      if (testRes.ok) {
        await logInfo("BOSS: Sandbox PASS", {
          userId,
          conversationId,
          iterations: iteration,
        });
        resumeAvailable = false;
        break;
      }

      const lastError = testRes.stderr || testRes.error || "Không rõ";

      await logWarn(`BOSS: Sandbox FAIL vòng ${iteration}`, {
        userId,
        conversationId,
        error: lastError.slice(0, 200),
      });

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
        taskType: "call-boss",
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
        taskType: fixGiao.taskType,
        messages: fixSoldierMessages,
        payload: fixFormat,
        temperature: 0.3,
        maxTokens: 8192,
        signal,
      });

      if (!fixLinh.ok || !fixLinh.text) {
        await logWarn("BOSS: lính sửa thất bại — tiếp tục", {
          error: fixLinh.error,
        });
        continue;
      }

      const validation = validateCodeOutput(fixLinh.text);
      if (validation.ok && validation.code) {
        initialCode = validation.code;
        language = validation.language || language;
      } else {
        initialCode = fixLinh.text;
      }
    }

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
    isCode: !!initialCode,
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
        "Bạn là BOSS. Code của lính bị lỗi Sandbox.\n" +
        "Đọc lỗi + viết FORMAT cho lính sửa.\n" +
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
        "Viết format sửa cho lính (JSON).",
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
// BOSS TRẢ LỜI CUỐI — BÁO PASS/FAIL + GỢI Ý SỬA TIẾP
// ============================================================

async function bossFinalAnswer({
  userId,
  conversationId,
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
        "Bạn là Rồng Thần. Vừa nhận kết quả từ lính.\n" +
        "Đọc kết quả → trả lời User tự nhiên, thân thiện.\n" +
        "\n" +
        "QUY TẮC BẮT BUỘC:\n" +
        "1. Tiếng Việt tự nhiên.\n" +
        "2. KHÔNG nhắc 'lính', 'Sandbox', 'giao việc'.\n" +
        "3. KHÔNG dùng LaTeX hay $$.\n" +
        "4. Nếu có code VÀ Sandbox PASS:\n" +
        "   - Nói rõ: 'Code đã vượt qua kiểm thử'.\n" +
        "   - Trình bày code trong ```<lang>...``` đầy đủ.\n" +
        "5. Nếu có code VÀ Sandbox FAIL hoặc chưa PASS:\n" +
        "   - Nói rõ: 'Code chưa vượt qua kiểm thử'.\n" +
        "   - Hướng dẫn User: 'Bạn có thể bấm nút 🔧 Sửa tiếp để mình tiếp tục sửa'.\n" +
        "   - Trình bày code hiện tại để User xem.\n" +
        "6. Nếu là văn bản → trình bày hoàn chỉnh.\n" +
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
    "KẾT QUẢ TỪ LÍNH:",
    "```",
    soldierOutput || "(không có)",
    "```",
    "",
    `TRẠNG THÁI KIỂM THỬ SANDBOX: ${sandboxStatus}`,
  ];

  if (isCode) {
    lines.push(`NGÔN NGỮ: ${language}`);
    if (sandboxStatus === "passed") {
      lines.push("→ Code ĐÃ VƯỢT QUA kiểm thử. Báo User thành công.");
    } else {
      lines.push(
        "→ Code CHƯA vượt qua kiểm thử. Báo User chưa PASS + gợi ý bấm 'Sửa tiếp'."
      );
    }
  }

  if (webContext) lines.push("", "DỮ LIỆU WEB:", webContext);

  lines.push("", "Viết câu trả lời hoàn chỉnh cho User.");

  messages.push({ role: "user", content: lines.join("\n") });

  const res = await goiBoss({
    userId,
    conversationId,
    taskType: "call-boss",
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
    return `⚠ Code chưa vượt qua kiểm thử.\n\n\`\`\`${language}\n${soldierOutput}\n\`\`\`\n\nBạn có thể bấm nút **🔧 Sửa tiếp** để mình tiếp tục sửa.`;
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
        "Bạn là lính — model AI được BOSS giao việc.\n" +
        "LÀM VIỆC theo format, TRẢ KẾT QUẢ cho BOSS.\n" +
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
    "FORMAT BOSS GIAO:",
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
      taskType: giao.taskType,
      messages: soldierMessages,
      payload: format,
      temperature: 0.3,
      maxTokens: 8192,
      signal,
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
  let sandboxStatus = "not_run";

  if (codeChunks.length > 0) {
    const mergedCode = mergeCodeChunks(codeChunks, lastLanguage);

    try {
      const testRes = await chayKiemThu({
        userId,
        conversationId,
        language: lastLanguage,
        code: mergedCode,
      });
      sandboxStatus = testRes.ok ? "passed" : "failed";

      await logInfo("BOSS: Sandbox code ghép", {
        userId,
        conversationId,
        status: testRes.status,
      });
    } catch {
      /* bỏ qua */
    }

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

    if (sandboxStatus === "passed") {
      finalText = `✅ Code đã vượt qua kiểm thử.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\``;
    } else {
      finalText = `⚠ Code chưa vượt qua kiểm thử.\n\n\`\`\`${lastLanguage}\n${mergedCode}\n\`\`\`\n\nBạn có thể bấm **🔧 Sửa tiếp** để mình tiếp tục sửa.`;
    }
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      action: "delegate-chunked",
      code: codeMeta,
      chunked: true,
      chunkCount: chunks.length,
      resumeAvailable: sandboxStatus === "failed",
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

  const result = await runSoldierWork({
    userId,
    conversationId,
    userRequest: "Sửa tiếp code hiện tại",
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
    signal,
  });

  if (!result.ok) return result;

  const finalText = await bossFinalAnswer({
    userId,
    conversationId,
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