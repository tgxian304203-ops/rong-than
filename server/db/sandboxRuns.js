// server/db/sandboxRuns.js
// Nhiệm vụ: Collection sandboxRuns — các lần chạy Sandbox.
// Trạng thái theo PHẦN 07 (shared/constants/sandboxStatus.js):
//   "idle" | "running" | "passed" | "failed" | "error"

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function sandboxRunsCol() {
  return col(COLLECTIONS.sandboxRuns);
}

// ============================================================
// GHI
// ============================================================

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
  const res = await sandboxRunsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// CẬP NHẬT KẾT QUẢ
// ============================================================

export async function finishRun(runId, { status, stdout, stderr, durationMs }) {
  const _id = toObjectId(runId);
  if (!_id) return false;
  const res = await sandboxRunsCol().updateOne(
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

// ============================================================
// ĐỌC
// ============================================================

export async function getRun(runId) {
  const _id = toObjectId(runId);
  if (!_id) return null;
  return sandboxRunsCol().findOne({ _id });
}

export async function listByConversation(conversationId) {
  return sandboxRunsCol()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
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