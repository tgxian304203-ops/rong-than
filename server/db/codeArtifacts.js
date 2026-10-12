// server/db/codeArtifacts.js
// Nhiệm vụ: Collection codeArtifacts — các phiên bản code lính viết.

import { ObjectId } from "mongodb";

const COL_NAME = "codeArtifacts";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function saveArtifact({
  userId,
  conversationId,
  language,
  code,
  version = 1,
  taskId = null,
}) {
  const doc = {
    userId,
    conversationId: String(conversationId),
    taskId: taskId ? String(taskId) : null,
    language,
    code,
    version,
    createdAt: new Date(),
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

export async function getLatest(conversationId, language) {
  return col().findOne(
    { conversationId: String(conversationId), language },
    { sort: { version: -1 } }
  );
}

/**
 * Lấy code mới nhất của hội thoại — bất kể ngôn ngữ nào.
 */
export async function getLatestAny(conversationId) {
  return col().findOne(
    { conversationId: String(conversationId) },
    { sort: { version: -1 } }
  );
}

export async function getNextVersion(conversationId, language) {
  const latest = await getLatest(conversationId, language);
  return latest ? latest.version + 1 : 1;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}