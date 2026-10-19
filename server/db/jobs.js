// server/db/jobs.js
// Nhiệm vụ: Quản lý trạng thái các tác vụ chạy ngầm (Background Jobs)
import { ObjectId } from "mongodb";

const COL_NAME = "jobs";
function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function createJob({ userId, conversationId }) {
  const doc = {
    userId,
    conversationId: String(conversationId),
    status: "processing",
    result: null,
    error: null,
    createdAt: new Date(),
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId, jobId: String(res.insertedId) };
}

export async function updateJobDone(jobId, result) {
  try {
    await col().updateOne({ _id: new ObjectId(jobId) }, { $set: { status: "done", result } });
  } catch (e) { /* ignore */ }
}

export async function updateJobError(jobId, error) {
  try {
    await col().updateOne({ _id: new ObjectId(jobId) }, { $set: { status: "error", error: String(error) } });
  } catch (e) { /* ignore */ }
}

export async function getJob(jobId) {
  try { return await col().findOne({ _id: new ObjectId(jobId) }); } catch { return null; }
}

export default { createJob, updateJobDone, updateJobError, getJob };