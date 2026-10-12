// server/db/attachments.js
// Nhiệm vụ: Collection attachments — tệp đính kèm của tin nhắn.

import { ObjectId } from "mongodb";

const COL_NAME = "attachments";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function saveAttachment({
  userId,
  conversationId,
  messageId,
  name,
  type,
  size,
  url = "",
  dataUrl = "",
}) {
  const doc = {
    userId,
    conversationId: String(conversationId),
    messageId: String(messageId),
    name,
    type,
    size,
    url,
    dataUrl,
    createdAt: new Date(),
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listByMessage(messageId) {
  return col().find({ messageId: String(messageId) }).toArray();
}

export async function getAttachment(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  return col().findOne({ _id });
}

export async function deleteByMessage(messageId) {
  const res = await col().deleteMany({ messageId: String(messageId) });
  return res.deletedCount;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}