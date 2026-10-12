// server/db/tasks.js
// Nhiệm vụ: Collection tasks — nhiệm vụ BOSS giao.

import { ObjectId } from "mongodb";

const COL_NAME = "tasks";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function createTask({
  userId,
  conversationId,
  bossSessionId,
  taskType,
  payload,
}) {
  const now = new Date();
  const doc = {
    userId,
    conversationId: String(conversationId),
    bossSessionId: bossSessionId ? String(bossSessionId) : null,
    taskType,
    payload,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function getTask(taskId) {
  const _id = toObjectId(taskId);
  if (!_id) return null;
  return col().findOne({ _id });
}

export async function listByConversation(conversationId) {
  return col()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function listByStatus(status) {
  return col().find({ status }).sort({ createdAt: 1 }).toArray();
}

export async function setStatus(taskId, status) {
  const _id = toObjectId(taskId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { status, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function deleteTask(taskId) {
  const _id = toObjectId(taskId);
  if (!_id) return false;
  const res = await col().deleteOne({ _id });
  return res.deletedCount > 0;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}