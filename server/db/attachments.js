// server/db/attachments.js
// Nhiệm vụ: Collection attachments — tệp đính kèm của tin nhắn.
// Lưu metadata; phần binary lưu ở nơi khác (hoặc base64 nếu nhỏ).

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function attachmentsCol() {
  return col(COLLECTIONS.attachments);
}

// ============================================================
// GHI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.messageId
 * @param {string} p.name
 * @param {string} p.type
 * @param {number} p.size
 * @param {string} [p.url]      - URL truy cập (nếu có)
 * @param {string} [p.dataUrl]  - base64 data URL (nếu nhỏ)
 */
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
  const res = await attachmentsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listByMessage(messageId) {
  return attachmentsCol()
    .find({ messageId: String(messageId) })
    .toArray();
}

export async function getAttachment(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  return attachmentsCol().findOne({ _id });
}

// ============================================================
// XÓA
// ============================================================

export async function deleteByMessage(messageId) {
  const res = await attachmentsCol().deleteMany({
    messageId: String(messageId),
  });
  return res.deletedCount;
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