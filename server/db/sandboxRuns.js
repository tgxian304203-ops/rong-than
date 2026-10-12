// server/db/sandboxRuns.js
// Nhiệm vụ: Collection sandboxRuns — các lần chạy Sandbox.

import { ObjectId } from "mongodb";

const COL_NAME = "sandboxRuns";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function createRun({
  userId,
  conversationId,
  language,
  code,
  testCode = "",
  timeoutMs = 10000,
}) {
  const now = new Date();
  const doc = {
    userId,
    conversationId: String(conversationId),
    language,
    code,
    testCode,
    timeoutMs,
    status: "running",
    stdout: "",
    stderr: "",
    durationMs: 0,
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function finishRun(runId, { status, stdout, stderr, durationMs }) {
  const _id = toObjectId(runId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    {
      $set: {
        status,
        stdout: stdout || "",
        stderr: stderr || "",
        durationMs: durationMs || 0,
        updatedAt: new Date(),
      },
    }
  );
  return res.modifiedCount > 0;
}

export async function getRun(runId) {
  const _id = toObjectId(runId);
  if (!_id) return null;
  return col().findOne({ _id });
}

export async function listByConversation(conversationId) {
  return col()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}