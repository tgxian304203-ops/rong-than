// server/db/messages.js
// Nhiệm vụ: Collection messages — tin nhắn trong cuộc trò chuyện.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function messagesCol() {
  return col(COLLECTIONS.messages);
}

// ============================================================
// TẠO
// ============================================================

/**
 * @param {object} msg
 * @param {string} msg.conversationId
 * @param {string} msg.userId
 * @param {"user"|"ai"} msg.role
 * @param {string} msg.text
 * @param {Array} [msg.attachments]
 * @param {object} [msg.meta]  — thông tin bổ sung (model dùng, sandbox run, v.v.)
 */
export async function createMessage({
  conversationId,
  userId,
  role,
  text = "",
  attachments = [],
  meta = null,
}) {
  const doc = {
    conversationId: String(conversationId),
    userId,
    role,
    text,
    attachments,
    meta,
    createdAt: new Date(),
  };
  const res = await messagesCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listMessages(conversationId) {
  return messagesCol()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function countMessages(conversationId) {
  return messagesCol().countDocuments({
    conversationId: String(conversationId),
  });
}

// ============================================================
// XÓA
// ============================================================

export async function deleteMessagesByConversation(conversationId) {
  const res = await messagesCol().deleteMany({
    conversationId: String(conversationId),
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