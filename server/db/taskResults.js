// server/db/taskResults.js
// Nhiệm vụ: Collection taskResults — kết quả lính trả về BOSS.

import { ObjectId } from "mongodb";

const COL_NAME = "taskResults";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function saveResult({
  taskId,
  subTaskId,
  status,
  output = "",
  meta = null,
}) {
  const doc = {
    taskId: String(taskId),
    subTaskId: String(subTaskId),
    status,
    output,
    meta,
    createdAt: new Date(),
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listByTask(taskId) {
  return col()
    .find({ taskId: String(taskId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function listBySubTask(subTaskId) {
  return col()
    .find({ subTaskId: String(subTaskId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getLatest(subTaskId) {
  return col().findOne(
    { subTaskId: String(subTaskId) },
    { sort: { createdAt: -1 } }
  );
}

export async function deleteByTask(taskId) {
  const res = await col().deleteMany({ taskId: String(taskId) });
  return res.deletedCount;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}