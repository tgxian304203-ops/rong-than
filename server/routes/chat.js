// server/routes/chat.js
// Nhiệm vụ: API chat — điểm vào chính của pipeline.
// BOSS tự kiểm tra Sandbox qua Piston. Nút "Sửa tiếp" để resume.

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
import { listMessages } from "../db/messages.js";
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
    return {
      ...msg,
      id: String(msg._id),
      attachments: mapped,
    };
  } catch {
    return { ...msg, id: String(msg._id), attachments: [] };
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

  const analysis = await phanTichYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!analysis.ok) return { ok: false, error: analysis.error };

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
  });

  let bossRes = await goiBoss({
    userId,
    conversationId,
    boss: bossPick.boss,
    messages: bossMessages,
    temperature: 0.4,
    maxTokens: 4096,
    signal,
  });

  if (!bossRes.ok) {
    await logWarn("BOSS cũ lỗi, gọi BOSS mới", {
      userId,
      conversationId,
      error: bossRes.error,
    });

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
  });
  if (!formatRes.ok) return { ok: false, error: formatRes.error };

  const giao = await giaoFormat({
    userId,
    conversationId,
    bossSessionId,
    format: formatRes.format,
  });
  if (!giao.ok) return { ok: false, error: giao.error };

  const soldierMessages = buildSoldierMessages({
    userRequest,
    format: formatRes.format,
    webContext,
  });

  const linh = await goiLinh({
    userId,
    taskId: giao.taskId,
    soldier: giao.soldier,
    messages: soldierMessages,
    payload: formatRes.format,
    temperature: 0.3,
    maxTokens: 8192,
    signal,
  });

  if (!linh.ok)
    return { ok: false, error: linh.error || "Lính không hoàn thành" };

  const received = await nhanKetQuaLinh({
    userId,
    conversationId,
    taskId: giao.taskId,
  });
  if (!received.ok) return { ok: false, error: received.error };

  const danhGia = await danhGiaKetQua({
    analysis: analysis.analysis,
    mergedText: received.merged || linh.text,
  });

  let finalText = linh.text || received.merged || "";
  let sandboxMeta = null;
  let codeMeta = null;
  let resumeAvailable = false;

  if (danhGia.needSandbox) {
    const language = guessLanguage(finalText);
    const initialCode = extractCodeBlock(finalText, language);

    if (initialCode) {
      // Piston luôn có — không cần kiểm tra SANDBOX_ENDPOINT
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

      // Lưu phiên bản code cuối cùng để resume
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
  }

  return {
    ok: true,
    text: finalText,
    meta: {
      analysis: analysis.analysis,
      sandbox: sandboxMeta,
      code: codeMeta,
      web: webContext ? { used: true } : null,
      boss: bossPick.boss,
      soldier: giao.soldier,
      resumeAvailable,
    },
  };
}

// ============================================================
// PIPELINE BOSS — RESUME (SỬA TIẾP)
// ============================================================

async function runBossResume({ userId, conversationId, signal }) {
  await logInfo("BOSS: BẮT ĐẦU RESUME (Sửa tiếp)", {
    userId,
    conversationId,
  });

  // 1. Đọc workState để biết yêu cầu gốc
  const workState = await loadWorkState(userId, conversationId);
  const goal = workState?.userRequest || "Sửa code cho tới khi hết lỗi";

  // 2. Đọc code mới nhất
  const latest = await getLatestCodeArtifact(conversationId);
  if (!latest || !latest.code) {
    await logWarn("BOSS: Resume thất bại — không có code cũ", {
      userId,
      conversationId,
    });
    return {
      ok: false,
      error: "Không tìm thấy code để sửa tiếp. Vui lòng tạo code mới.",
    };
  }

  const language = latest.language || "javascript";
  const currentCode = latest.code;

  await logInfo("BOSS: Resume — đọc code mới nhất", {
    userId,
    conversationId,
    language,
    version: latest.version,
    codeLength: currentCode.length,
  });

  // 3. Chọn BOSS
  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  const bossSessionId = null;

  // 4. Chạy vòng lặp sửa từ code hiện tại
  const loop = await vongLapSua({
    userId,
    conversationId,
    bossSessionId,
    language,
    initialCode: currentCode,
    goal,
    signal,
  });

  // 5. Lưu phiên bản cuối
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

function buildBossPlanMessages({ userRequest, analysis, webContext }) {
  const lines = [
    "Bạn là BOSS của Rồng Thần.",
    "Nhiệm vụ: lập kế hoạch xử lý yêu cầu User và mô tả format điều phối lính.",
    "",
    "Yêu cầu User:",
    userRequest,
    "",
    "Phân tích sơ bộ:",
    `- Cần tra web: ${analysis.needWeb ? "có" : "không"}`,
    `- Liên quan code: ${analysis.needCode ? "có" : "không"}`,
    `- Loại nhiệm vụ dự kiến: ${analysis.estimatedTaskType}`,
  ];

  if (webContext) {
    lines.push("", "Dữ liệu Web BOSS đã tra:", webContext);
  }

  lines.push(
    "",
    "Trả về kế hoạch ngắn gọn (không cần code).",
    "Khi trình bày công thức toán: dùng chữ thường. KHÔNG dùng $$ hoặc LaTeX."
  );

  return [
    {
      role: "system",
      content:
        "Bạn là BOSS — điều phối, không tự viết code dài. Không dùng LaTeX hay $$.",
    },
    { role: "user", content: lines.join("\n") },
  ];
}

function buildSoldierMessages({ userRequest, format, webContext }) {
  const lines = [
    "Bạn là lính của Tiểu Não. Nhiệm vụ do BOSS giao:",
    "",
    "Mục tiêu:",
    format.goal,
    "",
    `Loại: ${format.taskType}`,
  ];

  if (format.constraints?.length) {
    lines.push("", "Ràng buộc:");
    for (const c of format.constraints) lines.push(`- ${c}`);
  }

  if (format.expectedOutput) {
    lines.push("", "Kết quả mong đợi:", format.expectedOutput);
  }

  if (webContext) {
    lines.push("", "Dữ liệu Web BOSS cung cấp:", webContext);
  }

  lines.push(
    "",
    "Yêu cầu gốc của User:",
    userRequest,
    "",
    "Hãy trả về kết quả đầy đủ. Nếu là code, đặt trong ```<lang>...```.",
    "",
    "Khi trình bày công thức toán: dùng chữ thường. KHÔNG dùng $$ hoặc LaTeX."
  );

  return [
    {
      role: "system",
      content:
        "Bạn là lính. Trả về kết quả trực tiếp cho BOSS. Không dùng LaTeX hay $$.",
    },
    { role: "user", content: lines.join("\n") },
  ];
}

function guessLanguage(text) {
  if (typeof text !== "string") return "javascript";
  const m = text.match(/```([a-zA-Z0-9+\-#.]+)/);
  if (m && m[1]) {
    const l = m[1].toLowerCase();
    if (l.includes("python") || l === "py") return "python";
    if (l.includes("typescript") || l === "ts") return "typescript";
    if (l.includes("javascript") || l === "js") return "javascript";
    return l;
  }
  return "javascript";
}

function extractCodeBlock(text, language = "") {
  if (typeof text !== "string") return "";
  const re = /```([a-zA-Z0-9+\-#.]*)\n([\s\S]*?)```/g;
  let match;
  let best = "";
  while ((match = re.exec(text)) !== null) {
    const lang = (match[1] || "").toLowerCase();
    const body = match[2] || "";
    if (language && lang && lang.includes(language)) return body.trim();
    if (!best) best = body;
  }
  return best.trim();
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

    await logInfo("Rồng Thần: nhận yêu cầu SỬA TIẾP", {
      userId,
      conversationId,
    });

    // Lưu tin nhắn user "[Sửa tiếp]"
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