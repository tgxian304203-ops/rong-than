// src/api/chat.js
// Nhiệm vụ: API chat.
// - Gửi tin nhắn (kèm tệp đính kèm)
// - Nhận phản hồi
// - Tải lịch sử hội thoại
// - Quản lý hội thoại

import api from "./client.js";

// ============================================================
// GỬI TIN NHẮN
// ============================================================

/**
 * Gửi tin nhắn cho Rồng Thần.
 * @param {object} payload
 * @param {string} payload.conversationId
 * @param {string} [payload.text]
 * @param {File[]} [payload.attachments]
 * @param {AbortSignal} [payload.signal]
 * @returns {Promise<{ userMessage: object, aiMessage: object }>}
 */
export async function sendMessage({
  conversationId,
  text,
  attachments,
  signal,
}) {
  // ===== Validate =====
  if (!conversationId) {
    throw new Error("Thiếu conversationId để gửi tin nhắn");
  }

  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (!hasText && !hasAttachments) {
    throw new Error("Tin nhắn rỗng");
  }

  // ===== Có tệp đính kèm =====
  if (hasAttachments) {
    const form = new FormData();
    form.append("conversationId", String(conversationId));
    if (hasText) form.append("text", text.trim());
    for (const file of attachments) {
      form.append("attachments", file, file.name);
    }
    return api.upload("/chat/send", form, { signal });
  }

  // ===== Chỉ có text =====
  return api.post(
    "/chat/send",
    {
      conversationId: String(conversationId),
      text: hasText ? text.trim() : "",
    },
    { signal }
  );
}

// ============================================================
// LẤY HỘI THOẠI
// ============================================================

export async function getConversation(conversationId) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.get(`/chat/conversations/${encodeURIComponent(conversationId)}`);
}

export async function getMessages(conversationId) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.get(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages`
  );
}

// ============================================================
// LỊCH SỬ GẦN ĐÂY
// ============================================================

export async function listRecentConversations({ limit = 10 } = {}) {
  return api.get(`/chat/conversations/recent?limit=${limit}`);
}

// ============================================================
// TẠO HỘI THOẠI MỚI
// ============================================================

export async function createConversation({
  projectId = null,
  title = null,
} = {}) {
  return api.post("/chat/conversations", { projectId, title });
}

// ============================================================
// XÓA HỘI THOẠI
// ============================================================

export async function deleteConversation(conversationId) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.del(
    `/chat/conversations/${encodeURIComponent(conversationId)}`
  );
}

// ============================================================
// ĐỔI TÊN HỘI THOẠI
// ============================================================

export async function renameConversation(conversationId, title) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.patch(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { title }
  );
}