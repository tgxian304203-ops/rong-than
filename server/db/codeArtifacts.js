// server/db/codeArtifacts.js
// Nhiệm vụ: Collection codeArtifacts — hỗ trợ lưu trữ đa tệp (Virtual File System).

import { ObjectId } from "mongodb";

const COL_NAME = "codeArtifacts";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

/**
 * Lưu phiên bản code mới. Hỗ trợ lưu 1 hoặc nhiều file.
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {object} p.files - Dạng { "index.html": "code...", "app.js": "code..." }
 * @param {number} p.version
 * @param {string} [p.taskId]
 */
export async function saveArtifact({
  userId,
  conversationId,
  files,
  version = 1,
  taskId = null,
}) {
  const now = new Date();
  const doc = {
    userId,
    conversationId: String(conversationId),
    taskId: taskId ? String(taskId) : null,
    files, // Lưu toàn bộ danh sách file
    version,
    createdAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listByConversation(conversationId) {
  return col()
    .find({ conversationId: String(conversationId) })
    .sort({ version: -1 })
    .toArray();
}

export async function getLatestAny(conversationId) {
  return col().findOne(
    { conversationId: String(conversationId) },
    { sort: { version: -1 } }
  );
}

export async function getNextVersion(conversationId) {
  const latest = await getLatestAny(conversationId);
  return latest ? latest.version + 1 : 1;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}