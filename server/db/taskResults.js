// server/db/taskResults.js
// Nhiệm vụ: Collection taskResults — kết quả lính trả về BOSS.
// Mỗi subtask khi xong sẽ ghi kết quả vào đây, BOSS đọc để đánh giá.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function taskResultsCol() {
  return col(COLLECTIONS.taskResults);
}

// ============================================================
// GHI KẾT QUẢ
// ============================================================

/**
 * @param {object} p
 * @param {string} p.taskId
 * @param {string} p.subTaskId
 * @param {"success"|"error"} p.status
 * @param {string} p.output         - nội dung lính trả về
 * @param {object} [p.meta]         - token, thời gian, model...
 */
export async function saveResult({
  taskId,
  subTaskId,
  status,
  output = "",
  meta = null,
}) {
  const now = new Date();
  const doc = {
    taskId: String(taskId),
    subTaskId: String(subTaskId),
    status,
    output,
    meta,
    createdAt: now,
  };
  const res = await taskResultsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listByTask(taskId) {
  return taskResultsCol()
    .find({ taskId: String(taskId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function listBySubTask(subTaskId) {
  return taskResultsCol()
    .find({ subTaskId: String(subTaskId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getLatest(subTaskId) {
  return taskResultsCol().findOne(
    { subTaskId: String(subTaskId) },
    { sort: { createdAt: -1 } }
  );
}

// ============================================================
// XÓA
// ============================================================

export async function deleteByTask(taskId) {
  const res = await taskResultsCol().deleteMany({
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