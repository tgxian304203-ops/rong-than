// server/gateway/nhan-yeu-cau.js
// Nhiệm vụ: Rồng Thần nhận yêu cầu từ User.
// Đổi tên hội thoại nếu là tin nhắn đầu tiên.

import { createMessage } from "../db/messages.js";
import {
  touchConversation,
  updateTitleIfDefault,
} from "../db/conversations.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

export async function nhanYeuCau({
  userId,
  conversationId,
  text,
  attachments = [],
}) {
  if (!userId || !conversationId) {
    return { ok: false, error: "Thiếu userId hoặc conversationId" };
  }

  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasAttach = Array.isArray(attachments) && attachments.length > 0;

  if (!hasText && !hasAttach) {
    return { ok: false, error: "Yêu cầu rỗng" };
  }

  await logInfo("Rồng Thần: nhận yêu cầu từ User", {
    userId,
    conversationId,
    hasAttach,
    textLength: hasText ? text.trim().length : 0,
  });

  try {
    const userMessage = await createMessage({
      conversationId,
      userId,
      role: "user",
      text: hasText ? text.trim() : "",
      attachments,
      meta: null,
    });

    // Đổi tên hội thoại nếu đang dùng tên mặc định
    // Dùng text đầu tiên (hoặc tên tệp nếu chỉ có tệp)
    if (hasText) {
      await updateTitleIfDefault(conversationId, text.trim());
    } else if (hasAttach) {
      const firstAtt = attachments[0];
      const name = firstAtt?.name || firstAtt?.originalname || "Tệp đính kèm";
      await updateTitleIfDefault(conversationId, name);
    }

    await touchConversation(conversationId);

    return { ok: true, userMessage };
  } catch (err) {
    await logWarn("Rồng Thần: không nhận được yêu cầu", {
      userId,
      conversationId,
      error: err?.message || String(err),
    });
    return { ok: false, error: err?.message || "Không nhận được yêu cầu" };
  }
}

export default { nhanYeuCau };