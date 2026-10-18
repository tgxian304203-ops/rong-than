// server/db/codeArtifacts.js
// Nhiệm vụ: Collection codeArtifacts — hỗ trợ lưu trữ đa tệp (Virtual File System).
// SỬA LỖI: Khôi phục hàm getLatest() để tương thích với file quan-ly-phien-ban.js

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
  files,        // Schema mới
  language,     // Tương thích ngược
  code,         // Tương thích ngược
  version = 1,
  taskId = null,
}) {
  const now = new Date();
  
  // Nếu file cũ gọi hàm này mà truyền language & code, ta tự gộp thành object files
  let finalFiles = files;
  if (!finalFiles && language && code) {
    finalFiles = { [`file.${language}`]: code };
  }

  const doc = {
    userId,
    conversationId: String(conversationId),
    taskId: taskId ? String(taskId) : null,
    files: finalFiles || {},
    language: language || null,
    code: code || null,
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

// SỬA LỖI: Khôi phục hàm này để server không bị crash khi start
export async function getLatest(conversationId, language) {
  return col().findOne(
    { conversationId: String(conversationId), language },
    { sort: { version: -1 } }
  );
}

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