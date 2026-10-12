// server/db/webSearchRuns.js
// Nhiệm vụ: Collection webSearchRuns — lịch sử các lần BOSS tự tra Web.
// Quy tắc dự án:
//   - BOSS tự tra Web từ key dán ở phần giao diện dán key Web.
//   - Không liên quan tới key Đại Não/Tiểu Não.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function webSearchRunsCol() {
  return col(COLLECTIONS.webSearchRuns);
}

// ============================================================
// GHI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.provider       - "tavily" | "serpjet" | "brave"
 * @param {string} p.query
 * @param {Array}  p.results        - danh sách kết quả trả về
 * @param {"success"|"error"} p.status
 * @param {string} [p.error]
 */
export async function saveRun({
  userId,
  conversationId,
  provider,
  query,
  results = [],
  status = "success",
  error = "",
}) {
  const now = new Date();
  const doc = {
    userId,
    conversationId: String(conversationId),
    provider,
    query,
    results,
    status,
    error,
    createdAt: now,
  };
  const res = await webSearchRunsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listByConversation(conversationId) {
  return webSearchRunsCol()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getRun(runId) {
  const _id = toObjectId(runId);
  if (!_id) return null;
  return webSearchRunsCol().findOne({ _id });
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