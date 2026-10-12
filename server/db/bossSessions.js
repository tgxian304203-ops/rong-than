// server/db/bossSessions.js
// Nhiệm vụ: Collection bossSessions — phiên làm việc của BOSS.

import { ObjectId } from "mongodb";

const COL_NAME = "bossSessions";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

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
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function getActiveSession(conversationId) {
  return col().findOne({
    conversationId: String(conversationId),
    status: "active",
  });
}

export async function listByConversation(conversationId) {
  return col()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function markReplaced(sessionId) {
  const _id = toObjectId(sessionId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { status: "replaced", updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function markEnded(sessionId) {
  const _id = toObjectId(sessionId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { status: "ended", updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function markError(sessionId, note = "") {
  const _id = toObjectId(sessionId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { status: "error", note, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}