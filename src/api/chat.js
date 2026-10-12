// src/api/chat.js
// Nhiệm vụ: API chat.

import api from "./client.js";

// ============================================================
// GỬI TIN NHẮN
// ============================================================

export async function sendMessage({
  conversationId,
  text,
  attachments,
  signal,
}) {
  if (!conversationId) {
    throw new Error("Thiếu conversationId để gửi tin nhắn");
  }

  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (!hasText && !hasAttachments) {
    throw new Error("Tin nhắn rỗng");
  }

  if (hasAttachments) {
    const form = new FormData();
    form.append("conversationId", String(conversationId));
    if (hasText) form.append("text", text.trim());
    for (const file of attachments) {
      form.append("attachments", file, file.name || "file");
    }
    return api.upload("/chat/send", form, { signal });
  }

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
// LỊCH SỬ — LẤY TẤT CẢ
// ============================================================

export async function listRecentConversations(_opts = {}) {
  return api.get(`/chat/conversations/recent`);
}

// ============================================================
// TẠO HỘI THOẠI
// ============================================================

export async function createConversation({
  projectId = null,
  title = null,
} = {}) {
  return api.post("/chat/conversations", { projectId, title });
}

// ============================================================
// XÓA 1 HỘI THOẠI
// ============================================================

export async function deleteConversation(conversationId) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.del(
    `/chat/conversations/${encodeURIComponent(conversationId)}`
  );
}

// ============================================================
// XÓA TẤT CẢ HỘI THOẠI (không thuộc dự án)
// ============================================================

export async function deleteAllConversations() {
  return api.del(`/chat/conversations/all`);
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