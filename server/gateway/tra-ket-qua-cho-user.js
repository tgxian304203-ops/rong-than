// server/gateway/tra-ket-qua-cho-user.js
// Nhiệm vụ: Rồng Thần trả kết quả cho User.
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - RỒNG THẦN trả kết quả cho User.
//   - Không báo thành công khi backend chưa xác nhận.

import { createMessage } from "../db/messages.js";
import { touchConversation } from "../db/conversations.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// TRẢ KẾT QUẢ
// ============================================================

/**
 * Lưu tin nhắn AI vào DB rồi trả về cho tầng route (route sẽ gửi HTTP).
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.text
 * @param {object} [p.meta]
 * @returns {Promise<{ok: boolean, aiMessage?: object, error?: string}>}
 */
export async function traKetQuaChoUser({
  userId,
  conversationId,
  text,
  meta = null,
}) {
  if (!text || !String(text).trim()) {
    await logWarn("Rồng Thần: kết quả rỗng, không trả về User", {
      userId,
      conversationId,
    });
    return { ok: false, error: "Không có nội dung để trả về User" };
  }

  try {
    const aiMessage = await createMessage({
      conversationId,
      userId,
      role: "ai",
      text: String(text),
      attachments: [],
      meta,
    });

    await touchConversation(conversationId);

    await logInfo("Rồng Thần trả kết quả cho User", {
      userId,
      conversationId,
      textLength: String(text).length,
    });

    return { ok: true, aiMessage };
  } catch (err) {
    await logWarn("Rồng Thần không lưu được kết quả", {
      userId,
      conversationId,
      error: err?.message || String(err),
    });
    return { ok: false, error: err?.message || "Không lưu được kết quả" };
  }
}

export default { traKetQuaChoUser };