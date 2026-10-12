// src/api/chat.js
// Nhiệm vụ: API chat
// - Gửi tin nhắn (kèm tệp đính kèm)
// - Nhận phản hồi
// - Tải lịch sử hội thoại

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
export async function sendMessage({ conversationId, text, attachments, signal }) {
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (hasAttachments) {
    const form = new FormData();
    form.append("conversationId", conversationId);
    if (text) form.append("text", text);
    for (const file of attachments) {
      form.append("attachments", file, file.name);
    }
    return api.upload("/chat/send", form, { signal });
  }

  return api.post(
    "/chat/send",
    { conversationId, text },
    { signal }
  );
}

// ============================================================
// LẤY HỘI THOẠI
// ============================================================

export async function getConversation(conversationId) {
  return api.get(`/chat/conversations/${encodeURIComponent(conversationId)}`);
}

export async function getMessages(conversationId) {
  return api.get(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages`
  );
}

// ============================================================
// LỊCH SỬ GẦN ĐÂY
// ============================================================

/**
 * Lấy danh sách hội thoại gần đây.
 * @param {object} [opts]
 * @param {number} [opts.limit=10]
 */
export async function listRecentConversations({ limit = 10 } = {}) {
  return api.get(`/chat/conversations/recent?limit=${limit}`);
}

// ============================================================
// TẠO HỘI THOẠI MỚI
// ============================================================

export async function createConversation({ projectId = null, title = null } = {}) {
  return api.post("/chat/conversations", { projectId, title });
}

// ============================================================
// XÓA HỘI THOẠI
// ============================================================

export async function deleteConversation(conversationId) {
  return api.del(`/chat/conversations/${encodeURIComponent(conversationId)}`);
}

// ============================================================
// ĐỔI TÊN HỘI THOẠI
// ============================================================

export async function renameConversation(conversationId, title) {
  return api.patch(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { title }
  );
}