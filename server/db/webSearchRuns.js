// server/db/webSearchRuns.js
// Nhiệm vụ: Collection webSearchRuns — lịch sử BOSS tra Web.

import { ObjectId } from "mongodb";

const COL_NAME = "webSearchRuns";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function saveRun({
  userId,
  conversationId,
  provider,
  query,
  results = [],
  status = "success",
  error = "",
}) {
  const doc = {
    userId,
    conversationId: String(conversationId),
    provider,
    query,
    results,
    status,
    error,
    createdAt: new Date(),
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listByConversation(conversationId) {
  return col()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getRun(runId) {
  const _id = toObjectId(runId);
  if (!_id) return null;
  return col().findOne({ _id });
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}