// server/db/conversations.js
// Nhiệm vụ: Collection conversations — cuộc trò chuyện.
// Lịch sử gần đây hiển thị tối đa 10 mục nhưng KHÔNG xóa cũ.

import { ObjectId } from "mongodb";

const COL_NAME = "conversations";

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
    title: title || "Cuộc trò chuyện mới",
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function getConversation(userId, conversationId) {
  const _id = toObjectId(conversationId);
  if (!_id) return null;
  return col().findOne({ _id, userId });
}

export async function listConversationsByProject(userId, projectId) {
  return col()
    .find({ userId, projectId: String(projectId) })
    .sort({ updatedAt: -1 })
    .toArray();
}

export async function listRecentConversations(userId, { limit = 10 } = {}) {
  return col()
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
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

// ============================================================
// XÓA TẤT CẢ HỘI THOẠI CỦA 1 USER
// ============================================================

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