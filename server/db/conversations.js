// server/db/conversations.js
// Nhiệm vụ: Collection conversations — cuộc trò chuyện.
// - Hội thoại không thuộc dự án có projectId = null
// - Hội thoại thuộc dự án có projectId = <id dự án>

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

/**
 * Danh sách hội thoại trong 1 dự án.
 */
export async function listConversationsByProject(userId, projectId) {
  const items = await col()
    .find({ userId, projectId: String(projectId) })
    .sort({ updatedAt: -1 })
    .toArray();
  return items.map((it) => ({ ...it, id: String(it._id) }));
}

/**
 * Danh sách lịch sử chat — CHỈ hội thoại KHÔNG thuộc dự án.
 * projectId phải = null.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit] — nếu bỏ trống hoặc 0 → lấy tất cả
 */
export async function listRecentConversations(userId, { limit = 0 } = {}) {
  let cursor = col()
    .find({ userId, projectId: null })
    .sort({ updatedAt: -1 });

  if (limit > 0) cursor = cursor.limit(limit);

  const items = await cursor.toArray();
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

export async function updateTitleIfDefault(conversationId, newTitle) {
  const _id = toObjectId(conversationId);
  if (!_id) return false;

  const trimmed = String(newTitle || "").trim();
  if (!trimmed) return false;

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

/**
 * Xóa TẤT CẢ hội thoại KHÔNG thuộc dự án của 1 user.
 * Dùng cho nút "Xóa tất cả" ở Lịch sử chat.
 */
export async function deleteAllNonProjectConversations(userId) {
  const res = await col().deleteMany({ userId, projectId: null });
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