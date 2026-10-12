// server/db/subBrainTasks.js
// Nhiệm vụ: Collection subBrainTasks — nhiệm vụ con mà Tiểu Não
// chia cho từng lính.
// Mỗi task chính có thể tách thành nhiều task con cho nhiều lính.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function subBrainTasksCol() {
  return col(COLLECTIONS.subBrainTasks);
}

// ============================================================
// TẠO
// ============================================================

/**
 * @param {object} p
 * @param {string} p.taskId         - _id của task chính
 * @param {string} p.soldierModel   - tên model lính
 * @param {string} p.soldierProvider
 * @param {string} p.soldierKeyId
 * @param {object} p.payload        - format cho lính
 */
export async function createSubTask({
  taskId,
  soldierModel,
  soldierProvider,
  soldierKeyId,
  payload,
}) {
  const now = new Date();
  const doc = {
    taskId: String(taskId),
    soldierModel,
    soldierProvider,
    soldierKeyId: String(soldierKeyId),
    payload,
    status: "pending", // "pending" | "running" | "done" | "error"
    createdAt: now,
    updatedAt: now,
  };
  const res = await subBrainTasksCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function getSubTask(subTaskId) {
  const _id = toObjectId(subTaskId);
  if (!_id) return null;
  return subBrainTasksCol().findOne({ _id });
}

export async function listByTask(taskId) {
  return subBrainTasksCol()
    .find({ taskId: String(taskId) })
    .sort({ createdAt: 1 })
    .toArray();
}

// ============================================================
// CẬP NHẬT TRẠNG THÁI
// ============================================================

export async function setStatus(subTaskId, status) {
  const _id = toObjectId(subTaskId);
  if (!_id) return false;
  const res = await subBrainTasksCol().updateOne(
    { _id },
    { $set: { status, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteByTask(taskId) {
  const res = await subBrainTasksCol().deleteMany({
    taskId: String(taskId),
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