// server/gateway/tra-ket-qua-cho-user.js
// Nhiệm vụ: Rồng Thần trả kết quả cho User.

import { createMessage } from "../db/messages.js";
import { touchConversation } from "../db/conversations.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

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

    await logInfo("Rồng Thần: đã trả kết quả cho User", {
      userId,
      conversationId,
      textLength: String(text).length,
    });

    return { ok: true, aiMessage };
  } catch (err) {
    await logWarn("Rồng Thần: không lưu được kết quả", {
      userId,
      conversationId,
      error: err?.message || String(err),
    });
    return { ok: false, error: err?.message || "Không lưu được kết quả" };
  }
}

export default { traKetQuaChoUser };