// server/routes/chat.js
// Nhiệm vụ: API chat — điểm vào chính của pipeline.
// Xử lý tệp đính kèm với multer. Log chi tiết upload.

import express from "express";
import multer from "multer";

import {
  createConversation,
  listRecentConversations,
  getConversation,
  deleteConversation as dbDeleteConversation,
  updateConversationTitle,
} from "../db/conversations.js";
import { listMessages } from "../db/messages.js";
import {
  saveAttachment,
  listByMessage as listAttachmentsByMessage,
} from "../db/attachments.js";

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

// ============================================================
// MULTER
// ============================================================

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

  if (!linh.ok) return { ok: false, error: linh.error || "Lính không hoàn thành" };

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

  if (danhGia.needSandbox) {
    const language = guessLanguage(finalText);
    const initialCode = extractCodeBlock(finalText, language);

    if (initialCode) {
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

      if (loop.ok) {
        codeMeta = { language, version: loop.version };
        finalText = `Đã hoàn thành. Code đã vượt qua kiểm thử Sandbox (v${
          loop.version || 1
        }, ${loop.attempts} lần thử).\n\n\`\`\`${language}\n${loop.finalCode}\n\`\`\``;
      } else {
        finalText = `Chưa vượt qua kiểm thử sau ${loop.attempts} lần thử.\n\nLỗi cuối:\n${
          loop.lastRun?.stderr || "(không rõ)"
        }\n\nCode hiện tại:\n\`\`\`${language}\n${loop.finalCode}\n\`\`\``;
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
    },
  };
}

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
    "Trả về kế hoạch ngắn gọn (không cần code), tập trung vào:",
    "1. Mục tiêu cụ thể",
    "2. Loại nhiệm vụ giao lính (code/fix/analysis/summary/research/bulk)",
    "3. Ràng buộc quan trọng"
  );

  return [
    {
      role: "system",
      content: "Bạn là BOSS — điều phối, không tự viết code dài.",
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
    "Hãy trả về kết quả đầy đủ. Nếu là code, đặt trong ```<lang>...```."
  );

  return [
    {
      role: "system",
      content: "Bạn là lính. Trả về kết quả trực tiếp cho BOSS.",
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
        // Log lỗi multer
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

      // LOG NGAY ĐẦU — để chắc chắn request đã tới
      await logInfo("Nhận /chat/send", {
        userId,
        hasUserHeader: !!userId,
        bodyKeys: Object.keys(req.body || {}),
        filesCount: files.length,
        fileNames: files.map((f) => ({
          name: f.originalname,
          size: f.size,
          mime: f.mimetype,
        })),
      });

      if (!userId) {
        return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
      }

      const conversationId = req.body?.conversationId;
      const text = req.body?.text || "";

      if (!conversationId) {
        return res
          .status(400)
          .json({ ok: false, message: "Thiếu conversationId" });
      }

      if (!String(text).trim() && files.length === 0) {
        return res.status(400).json({ ok: false, message: "Tin nhắn rỗng" });
      }

      // 1. Nhận yêu cầu
      const recv = await gwNhanYeuCau({
        userId,
        conversationId,
        text,
        attachments: [],
      });
      if (!recv.ok) {
        return res.status(400).json({ ok: false, message: recv.error });
      }

      // 1b. Lưu tệp đính kèm
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

            await logInfo("Đã lưu tệp đính kèm", {
              userId,
              name: f.originalname,
              isImage,
              tooBig,
              size: f.size,
              dataUrlLength: dataUrl.length,
            });
          } catch (e) {
            await logWarn("Không lưu được tệp đính kèm", {
              name: f?.originalname,
              error: e?.message || String(e),
            });
          }
        }
      }

      // 2. Chuyển cho BOSS
      const bossResult = await chuyenYeuCauChoBoss({
        userId,
        conversationId,
        userRequest: String(text || ""),
        userLabel: null,
        runBoss: runBossPipeline,
      });

      // 3. Nhận kết quả
      const received = await nhanKetQuaTuBoss({
        userId,
        conversationId,
        bossResult,
      });
      if (!received.ok) {
        return res.status(500).json({ ok: false, message: received.error });
      }

      // 4. Trả cho User
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
// ROUTE — HỘI THOẠI GẦN ĐÂY
// ============================================================

router.get("/conversations/recent", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const limit = Number(req.query.limit) || 10;
    const items = await listRecentConversations(userId, { limit });
    const mapped = items.map((c) => ({ ...c, id: String(c._id) }));
    return res.json({ ok: true, items: mapped });
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