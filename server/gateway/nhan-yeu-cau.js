// server/gateway/nhan-yeu-cau.js
// Nhiệm vụ: Rồng Thần nhận yêu cầu từ User.
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - RỒNG THẦN nhận yêu cầu.
//   - RỒNG THẦN chuyển yêu cầu cho BOSS.

import { createMessage } from "../db/messages.js";
import { touchConversation } from "../db/conversations.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// NHẬN
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.text
 * @param {Array}  [p.attachments]
 * @returns {Promise<{ok: boolean, userMessage?: object, error?: string}>}
 */
export async function nhanYeuCau({ userId, conversationId, text, attachments = [] }) {
  if (!userId || !conversationId) {
    return { ok: false, error: "Thiếu userId hoặc conversationId" };
  }

  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasAttach = Array.isArray(attachments) && attachments.length > 0;

  if (!hasText && !hasAttach) {
    return { ok: false, error: "Yêu cầu rỗng" };
  }

  try {
    const userMessage = await createMessage({
      conversationId,
      userId,
      role: "user",
      text: hasText ? text.trim() : "",
      attachments,
      meta: null,
    });

    await touchConversation(conversationId);

    await logInfo("Rồng Thần nhận yêu cầu từ User", {
      userId,
      conversationId,
      hasAttach,
      textLength: hasText ? text.trim().length : 0,
    });

    return { ok: true, userMessage };
  } catch (err) {
    await logWarn("Rồng Thần không nhận được yêu cầu", {
      userId,
      conversationId,
      error: err?.message || String(err),
    });
    return { ok: false, error: err?.message || "Không nhận được yêu cầu" };
  }
}

export default { nhanYeuCau };