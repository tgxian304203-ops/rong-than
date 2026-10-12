// server/routes/chat.js
// Nhiệm vụ: API chat — điểm vào chính của pipeline.
//
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - User gửi yêu cầu.
//   - Rồng Thần nhận → chuyển cho BOSS.
//   - BOSS xử lý → trả kết quả cho Rồng Thần → trả cho User.
//
// Hỗ trợ tệp đính kèm: dùng multer (memoryStorage).
// Pipeline BOSS nằm trong file này (theo đúng sơ đồ —
// không tạo file boss/index.js riêng).

import express from "express";
import multer from "multer";
import { ObjectId } from "mongodb";

import {
  createConversation,
  listRecentConversations,
  getConversation,
  deleteConversation as dbDeleteConversation,
  updateConversationTitle,
} from "../db/conversations.js";
import { listMessages } from "../db/messages.js";
import { saveAttachment } from "../db/attachments.js";

import { nhanYeuCau as gwNhanYeuCau } from "../gateway/nhan-yeu-cau.js";
import { chuyenYeuCauChoBoss } from "../gateway/chuyen-yeu-cau-cho-boss.js";
import { nhanKetQuaTuBoss } from "../gateway/nhan-ket-qua-tu-boss.js";
import { traKetQuaChoUser } from "../gateway/tra-ket-qua-cho-user.js";

// BOSS components
import { nhanYeuCau as bossNhanYeuCau } from "../boss/nhan-yeu-cau.js";
import { phanTichYeuCau } from "../boss/phan-tich-yeu-cau.js";
import { traWeb, formatWebResults } from "../boss/tra-web.js";
import { vietFormat } from "../boss/viet-format.js";
import { giaoFormat } from "../boss/giao-format.js";
import { nhanKetQuaLinh } from "../boss/nhan-ket-qua-linh.js";
import { danhGiaKetQua } from "../boss/danh-gia-ket-qua.js";
import { vongLapSua } from "../boss/vong-lap-sua.js";

// Đại Não
import { chonBossTheoYeuCau } from "../dai-nao/chon-boss-theo-yeu-cau.js";
import { goiBoss } from "../dai-nao/goi-boss.js";
import { goiBossMoi } from "../dai-nao/goi-boss-moi.js";
import {
  banGiaoTrangThai,
  buildHandoffPrompt,
} from "../dai-nao/ban-giao-trang-thai.js";

// Tiểu Não
import { goiLinh } from "../tieu-nao/goi-linh.js";

import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const router = express.Router();

// ============================================================
// MULTER — CHO TỆP ĐÍNH KÈM
// ============================================================

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

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

// ============================================================
// PIPELINE BOSS — CHẠY 1 LƯỢT
// ============================================================

async function runBossPipeline({
  userId,
  conversationId,
  userRequest,
  userLabel,
  signal,
}) {
  // 1. BOSS nhận yêu cầu
  const recv = await bossNhanYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!recv.ok) return { ok: false, error: recv.error };

  // 2. BOSS phân tích yêu cầu
  const analysis = await phanTichYeuCau({
    userId,
    conversationId,
    userRequest,
    userLabel,
  });
  if (!analysis.ok) return { ok: false, error: analysis.error };

  // 3. Tra Web nếu cần
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

  // 4. Chọn BOSS từ key Đại Não
  const bossPick = await chonBossTheoYeuCau({ userId });
  if (!bossPick.ok) return { ok: false, error: bossPick.error };

  // 5. Gọi BOSS lập kế hoạch
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

  // Nếu BOSS cũ lỗi → gọi BOSS mới (theo dự án PHẦN 01, mục 5)
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

  // 6. BOSS viết format điều phối
  const formatRes = await vietFormat({
    userId,
    conversationId,
    userRequest,
    analysis: analysis.analysis,
    webContext: [webContext, bossPlan].filter(Boolean).join("\n\n"),
  });
  if (!formatRes.ok) return { ok: false, error: formatRes.error };

  // 7. Giao format cho Tiểu Não
  const giao = await giaoFormat({
    userId,
    conversationId,
    bossSessionId,
    format: formatRes.format,
  });
  if (!giao.ok) return { ok: false, error: giao.error };

  // 8. Gọi lính
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

  // 9. Nhận + đánh giá kết quả
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

  // 10. Nếu là code → vòng lặp Sandbox cho tới khi đúng
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

  // 11. Trả kết quả cho Rồng Thần
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

// ============================================================
// XÂY MESSAGES CHO BOSS
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

// ============================================================
// XÂY MESSAGES CHO LÍNH
// ============================================================

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

// ============================================================
// TIỆN ÍCH
// ============================================================

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
// ROUTE — GỬI TIN NHẮN (có hỗ trợ tệp đính kèm)
// ============================================================

router.post("/send", upload.array("attachments", 10), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    }

    // multer đưa form fields vào req.body
    const conversationId = req.body?.conversationId;
    const text = req.body?.text || "";
    const files = Array.isArray(req.files) ? req.files : [];

    if (!conversationId) {
      return res
        .status(400)
        .json({ ok: false, message: "Thiếu conversationId" });
    }

    if (!String(text).trim() && files.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "Tin nhắn rỗng" });
    }

    // 1. Rồng Thần nhận yêu cầu
    const recv = await gwNhanYeuCau({
      userId,
      conversationId,
      text,
      attachments: [],
    });
    if (!recv.ok) {
      return res.status(400).json({ ok: false, message: recv.error });
    }

    // 1b. Lưu tệp đính kèm vào DB
    const savedAttachments = [];
    if (files.length > 0 && recv.userMessage?._id) {
      for (const f of files) {
        try {
          const isImage = String(f.mimetype || "").startsWith("image/");
          const dataUrl = isImage
            ? `data:${f.mimetype};base64,${f.buffer.toString("base64")}`
            : "";
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
            dataUrl: att.dataUrl,
          });
        } catch (e) {
          await logWarn("Không lưu được tệp đính kèm", {
            error: e?.message || String(e),
          });
        }
      }
    }

    // 2. Chuyển cho BOSS (đã có khóa tránh xung đột)
    const bossResult = await chuyenYeuCauChoBoss({
      userId,
      conversationId,
      userRequest: String(text || ""),
      userLabel: null,
      runBoss: runBossPipeline,
    });

    // 3. Rồng Thần nhận kết quả từ BOSS
    const received = await nhanKetQuaTuBoss({
      userId,
      conversationId,
      bossResult,
    });
    if (!received.ok) {
      return res.status(500).json({ ok: false, message: received.error });
    }

    // 4. Rồng Thần trả kết quả cho User (lưu vào DB)
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
      userMessage: { ...recv.userMessage, attachments: savedAttachments },
      aiMessage: delivered.aiMessage,
    });
  } catch (err) {
    await logWarn("Lỗi /chat/send", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — TẠO HỘI THOẠI
// ============================================================

router.post("/conversations", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId = null, title = null } = req.body || {};
    const convo = await createConversation({ userId, projectId, title });
    return res.json({ ok: true, conversation: convo });
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
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId } = req.params;
    const convo = await getConversation(userId, conversationId);
    if (!convo) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy hội thoại" });
    }
    const items = await listMessages(conversationId);
    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ROUTE — LẤY HỘI THOẠI GẦN ĐÂY
// ============================================================

router.get("/conversations/recent", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const limit = Number(req.query.limit) || 10;
    const items = await listRecentConversations(userId, { limit });
    return res.json({ ok: true, items });
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
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId } = req.params;
    const ok = await dbDeleteConversation(userId, conversationId);
    if (!ok) return res.status(404).json({ ok: false, message: "Không xóa được" });
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
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId } = req.params;
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, message: "Thiếu title" });

    const convo = await getConversation(userId, conversationId);
    if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy" });

    const ok = await updateConversationTitle(conversationId, String(title));
    return res.json({ ok });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;