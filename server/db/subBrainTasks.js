// server/db/subBrainTasks.js
// Nhiệm vụ: Collection subBrainTasks — nhiệm vụ con cho từng lính.

import { ObjectId } from "mongodb";

const COL_NAME = "subBrainTasks";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

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
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function getSubTask(subTaskId) {
  const _id = toObjectId(subTaskId);
  if (!_id) return null;
  return col().findOne({ _id });
}

export async function listByTask(taskId) {
  return col()
    .find({ taskId: String(taskId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function setStatus(subTaskId, status) {
  const _id = toObjectId(subTaskId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { status, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
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