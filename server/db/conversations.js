// server/db/conversations.js
// Nhiệm vụ: Collection conversations — cuộc trò chuyện.
// Theo đặc tả: Lịch sử gần đây hiển thị tối đa 10 mục.
// Nhưng KHÔNG xóa cũ — chỉ giới hạn số hiển thị.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function conversationsCol() {
  return col(COLLECTIONS.conversations);
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
  const res = await conversationsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function getConversation(userId, conversationId) {
  const _id = toObjectId(conversationId);
  if (!_id) return null;
  return conversationsCol().findOne({ _id, userId });
}

export async function listConversationsByProject(userId, projectId) {
  return conversationsCol()
    .find({ userId, projectId: String(projectId) })
    .sort({ updatedAt: -1 })
    .toArray();
}

/**
 * Lịch sử gần đây.
 * Mặc định limit = 10 theo đặc tả, nhưng cho phép override.
 */
export async function listRecentConversations(userId, { limit = 10 } = {}) {
  return conversationsCol()
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
  const res = await conversationsCol().updateOne(
    { _id },
    { $set: { updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function updateConversationTitle(conversationId, title) {
  const _id = toObjectId(conversationId);
  if (!_id) return false;
  const res = await conversationsCol().updateOne(
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
  const res = await conversationsCol().deleteOne({ _id, userId });
  return res.deletedCount > 0;
}

export async function deleteConversationsByProject(userId, projectId) {
  const res = await conversationsCol().deleteMany({
    userId,
    projectId: String(projectId),
  });
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