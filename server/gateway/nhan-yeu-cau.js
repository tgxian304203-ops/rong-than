// server/gateway/nhan-yeu-cau.js
// Nhiệm vụ: Rồng Thần nhận yêu cầu từ User.

import { createMessage } from "../db/messages.js";
import { touchConversation } from "../db/conversations.js";
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