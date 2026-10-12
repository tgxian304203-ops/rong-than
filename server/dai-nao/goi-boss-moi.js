// server/dai-nao/goi-boss-moi.js
// Nhiệm vụ: Khi BOSS cũ hết quota hoặc lỗi, Đại Não gọi BOSS mới lên thay.
// Quy tắc dự án (PHẦN 01, mục 5):
//   - Đại Não gọi BOSS mới từ key của phần Đại Não.
//   - BOSS mới phải đọc lại yêu cầu User.
//   - BOSS mới xác định tình trạng hiện tại đang làm gì, đã làm tới đâu.
//   - BOSS mới tiếp tục nhiệm vụ.

import { markReplaced } from "../db/bossSessions.js";
import { loadWorkState } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { chonBossTheoYeuCau } from "./chon-boss-theo-yeu-cau.js";
import { goiBoss } from "./goi-boss.js";

// ============================================================
// GỌI BOSS MỚI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {object} [p.oldSession]  - phiên BOSS cũ (nếu có)
 * @param {Array}  p.messages      - tin nhắn hội thoại đầy đủ
 * @param {number} [p.temperature]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, text?: string, session?: object, boss?: object, handoff?: object, error?: string}>}
 */
export async function goiBossMoi({
  userId,
  conversationId,
  oldSession,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
}) {
  // ===== 1. Đọc lại yêu cầu User + tình trạng =====
  const workState = await loadWorkState(userId, conversationId);
  const handoff = {
    userRequest: workState?.userRequest || null,
    currentStep: workState?.currentStep || null,
    status: workState?.status || null,
    context: workState?.context || {},
  };

  // ===== 2. Đánh dấu phiên BOSS cũ là "replaced" =====
  if (oldSession && oldSession._id) {
    try {
      await markReplaced(String(oldSession._id));
    } catch {
      /* bỏ qua */
    }
  }

  // ===== 3. Chọn BOSS mới =====
  const picked = await chonBossTheoYeuCau({ userId });
  if (!picked.ok) {
    return {
      ok: false,
      handoff,
      error: picked.error || "Không có BOSS mới khả dụng",
    };
  }

  // ===== 4. Chuẩn bị messages có bàn giao =====
  const handoffMessage = buildHandoffMessage(handoff);
  const messagesWithHandoff = handoffMessage
    ? [...messages, { role: "system", content: handoffMessage }]
    : messages;

  // ===== 5. Gọi BOSS mới =====
  const res = await goiBoss({
    userId,
    conversationId,
    boss: picked.boss,
    messages: messagesWithHandoff,
    temperature,
    maxTokens,
    signal,
  });

  if (res.ok) {
    await logInfo("Gọi BOSS mới thành công", {
      userId,
      conversationId,
      boss: picked.boss.name,
    });
  } else {
    await logWarn("Gọi BOSS mới thất bại", {
      userId,
      conversationId,
      boss: picked.boss.name,
      error: res.error,
    });
  }

  return {
    ok: res.ok,
    text: res.text,
    session: res.session,
    boss: picked.boss,
    handoff,
    error: res.error,
  };
}

// ============================================================
// XÂY MESSAGES BÀN GIAO
// ============================================================

function buildHandoffMessage(handoff) {
  if (!handoff || !handoff.userRequest) return null;

  const lines = [
    "[BÀN GIAO BOSS MỚI]",
    "BOSS cũ đã hết quota hoặc lỗi. Bạn là BOSS mới.",
    "",
    "Yêu cầu gốc của User:",
    `"${handoff.userRequest}"`,
    "",
    `Bước hiện tại: ${handoff.currentStep || "(chưa rõ)"}`,
    `Trạng thái: ${handoff.status || "(chưa rõ)"}`,
  ];

  if (handoff.context && Object.keys(handoff.context).length > 0) {
    lines.push("");
    lines.push("Ngữ cảnh bổ sung:");
    try {
      lines.push(JSON.stringify(handoff.context, null, 2));
    } catch {
      /* bỏ qua */
    }
  }

  lines.push("");
  lines.push("Hãy đọc lại yêu cầu, xác định đang làm gì, đã làm tới đâu,");
  lines.push("và tiếp tục nhiệm vụ cho đúng.");

  return lines.join("\n");
}

export default { goiBossMoi };