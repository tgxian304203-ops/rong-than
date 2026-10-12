// server/db/conversations.js
// Nhiệm vụ: Collection conversations — cuộc trò chuyện.

import { ObjectId } from "mongodb";

const COL_NAME = "conversations";
const DEFAULT_TITLE = "Cuộc trò chuyện mới";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

// ============================================================
// TẠO
// ============================================================

export async function createConversation({
  userId,
  projectId = null,
  title = null,
}) {
  const now = new Date();
  const doc = {
    userId,
    projectId: projectId ? String(projectId) : null,
    title: title || DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId, id: String(res.insertedId) };
}

// ============================================================
// ĐỌC
// ============================================================

export async function getConversation(userId, conversationId) {
  const _id = toObjectId(conversationId);
  if (!_id) return null;
  const doc = await col().findOne({ _id, userId });
  if (!doc) return null;
  return { ...doc, id: String(doc._id) };
}

export async function listConversationsByProject(userId, projectId) {
  const items = await col()
    .find({ userId, projectId: String(projectId) })
    .sort({ updatedAt: -1 })
    .toArray();
  return items.map((it) => ({ ...it, id: String(it._id) }));
}

export async function listRecentConversations(userId, { limit = 10 } = {}) {
  const items = await col()
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
  return items.map((it) => ({ ...it, id: String(it._id) }));
}

// ============================================================
// CẬP NHẬT
// ============================================================

export async function touchConversation(conversationId) {
  const _id = toObjectId(conversationId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function updateConversationTitle(conversationId, title) {
  const _id = toObjectId(conversationId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { title, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

/**
 * Đổi tên hội thoại nếu đang dùng tên mặc định.
 * Dùng khi user gửi tin nhắn đầu tiên.
 */
export async function updateTitleIfDefault(conversationId, newTitle) {
  const _id = toObjectId(conversationId);
  if (!_id) return false;

  const trimmed = String(newTitle || "").trim();
  if (!trimmed) return false;

  // Cắt tối đa 60 ký tự
  const title = trimmed.length > 60 ? trimmed.slice(0, 57) + "…" : trimmed;

  const res = await col().updateOne(
    { _id, title: DEFAULT_TITLE },
    { $set: { title, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteConversation(userId, conversationId) {
  const _id = toObjectId(conversationId);
  if (!_id) return false;
  const res = await col().deleteOne({ _id, userId });
  return res.deletedCount > 0;
}

export async function deleteConversationsByProject(userId, projectId) {
  const res = await col().deleteMany({
    userId,
    projectId: String(projectId),
  });
  return res.deletedCount;
}

export async function deleteConversationsByUser(userId) {
  const res = await col().deleteMany({ userId });
  return res.deletedCount;
}

// ============================================================
// TIỆN ÍCH
// ============================================================

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}