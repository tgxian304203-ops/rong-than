// server/db/tasks.js
// Nhiệm vụ: Collection tasks — nhiệm vụ BOSS giao.
// BOSS viết format điều phối → lưu thành task → Tiểu Não đọc và gọi lính.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function tasksCol() {
  return col(COLLECTIONS.tasks);
}

// ============================================================
// TẠO
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.bossSessionId
 * @param {string} p.taskType       - "code" | "fix" | "analysis" | "summary" | "research" | "large"
 * @param {object} p.payload        - format điều phối lính
 */
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
    status: "pending", // "pending" | "running" | "done" | "error"
    createdAt: now,
    updatedAt: now,
  };
  const res = await tasksCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function getTask(taskId) {
  const _id = toObjectId(taskId);
  if (!_id) return null;
  return tasksCol().findOne({ _id });
}

export async function listByConversation(conversationId) {
  return tasksCol()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function listByStatus(status) {
  return tasksCol()
    .find({ status })
    .sort({ createdAt: 1 })
    .toArray();
}

// ============================================================
// CẬP NHẬT TRẠNG THÁI
// ============================================================

export async function setStatus(taskId, status) {
  const _id = toObjectId(taskId);
  if (!_id) return false;
  const res = await tasksCol().updateOne(
    { _id },
    { $set: { status, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteTask(taskId) {
  const _id = toObjectId(taskId);
  if (!_id) return false;
  const res = await tasksCol().deleteOne({ _id });
  return res.deletedCount > 0;
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