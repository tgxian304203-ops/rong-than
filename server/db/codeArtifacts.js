// server/db/codeArtifacts.js
// Nhiệm vụ: Collection codeArtifacts — các phiên bản code lính viết.
// Khi BOSS kiểm Sandbox sai → viết format cho lính sửa → phiên bản mới.
// Lưu từng phiên bản để truy vết.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function codeArtifactsCol() {
  return col(COLLECTIONS.codeArtifacts);
}

// ============================================================
// GHI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.language
 * @param {string} p.code
 * @param {number} p.version        - phiên bản, bắt đầu từ 1
 * @param {string} [p.taskId]
 */
export async function saveArtifact({
  userId,
  conversationId,
  language,
  code,
  version = 1,
  taskId = null,
}) {
  const now = new Date();
  const doc = {
    userId,
    conversationId: String(conversationId),
    taskId: taskId ? String(taskId) : null,
    language,
    code,
    version,
    createdAt: now,
  };
  const res = await codeArtifactsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listByConversation(conversationId) {
  return codeArtifactsCol()
    .find({ conversationId: String(conversationId) })
    .sort({ version: -1 })
    .toArray();
}

export async function getLatest(conversationId, language) {
  return codeArtifactsCol().findOne(
    { conversationId: String(conversationId), language },
    { sort: { version: -1 } }
  );
}

export async function getNextVersion(conversationId, language) {
  const latest = await getLatest(conversationId, language);
  return latest ? latest.version + 1 : 1;
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