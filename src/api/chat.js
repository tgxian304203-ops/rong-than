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
// LẤY TRẠNG THÁI JOB (POLLING)
// ============================================================

export async function getJobStatus(jobId) {
  if (!jobId) {
    throw new Error("Thiếu jobId để kiểm tra trạng thái");
  }
  return api.get(`/chat/jobs/${encodeURIComponent(jobId)}`);
}

// ============================================================
// SỬA TIẾP (RESUME)
// ============================================================

export async function fixContinue({ conversationId, signal }) {
  if (!conversationId) {
    throw new Error("Thiếu conversationId để sửa tiếp");
  }
  return api.post(
    "/chat/fix-continue",
    { conversationId: String(conversationId) },
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

export async function listRecentConversations(_opts = {}) {
  return api.get(`/chat/conversations/recent`);
}

export async function createConversation({
  projectId = null,
  title = null,
} = {}) {
  return api.post("/chat/conversations", { projectId, title });
}

export async function deleteConversation(conversationId) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.del(
    `/chat/conversations/${encodeURIComponent(conversationId)}`
  );
}

export async function deleteAllConversations() {
  return api.del(`/chat/conversations/all`);
}

export async function renameConversation(conversationId, title) {
  if (!conversationId) throw new Error("Thiếu conversationId");
  return api.patch(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { title }
  );
}