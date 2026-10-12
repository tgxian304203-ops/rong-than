// server/db/bossSessions.js
// Nhiệm vụ: Collection bossSessions — phiên làm việc của BOSS.
// Dùng khi BOSS hết quota/lỗi → Đại Não gọi BOSS mới lên thay,
// BOSS mới đọc lại yêu cầu User + xác định tình trạng hiện tại.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function bossSessionsCol() {
  return col(COLLECTIONS.bossSessions);
}

// ============================================================
// TẠO PHIÊN BOSS
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.modelName
 * @param {string} p.provider
 * @param {string} p.keyId
 */
export async function createSession({
  userId,
  conversationId,
  modelName,
  provider,
  keyId,
}) {
  const now = new Date();
  const doc = {
    userId,
    conversationId: String(conversationId),
    modelName,
    provider,
    keyId: String(keyId),
    status: "active", // "active" | "replaced" | "ended" | "error"
    createdAt: now,
    updatedAt: now,
  };
  const res = await bossSessionsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function getActiveSession(conversationId) {
  return bossSessionsCol().findOne({
    conversationId: String(conversationId),
    status: "active",
  });
}

export async function listByConversation(conversationId) {
  return bossSessionsCol()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

// ============================================================
// CẬP NHẬT TRẠNG THÁI
// ============================================================

export async function markReplaced(sessionId) {
  const _id = toObjectId(sessionId);
  if (!_id) return false;
  const res = await bossSessionsCol().updateOne(
    { _id },
    { $set: { status: "replaced", updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function markEnded(sessionId) {
  const _id = toObjectId(sessionId);
  if (!_id) return false;
  const res = await bossSessionsCol().updateOne(
    { _id },
    { $set: { status: "ended", updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function markError(sessionId, note = "") {
  const _id = toObjectId(sessionId);
  if (!_id) return false;
  const res = await bossSessionsCol().updateOne(
    { _id },
    { $set: { status: "error", note, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
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