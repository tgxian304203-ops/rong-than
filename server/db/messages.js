// server/db/messages.js
// Nhiệm vụ: Collection messages — tin nhắn trong cuộc trò chuyện.

const COL_NAME = "messages";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

// ============================================================
// TẠO
// ============================================================

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
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listMessages(conversationId) {
  return col()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function countMessages(conversationId) {
  return col().countDocuments({
    conversationId: String(conversationId),
  });
}

/**
 * Lấy N tin nhắn gần nhất — sắp xếp theo thời gian TĂNG DẦN.
 *
 * @param {string} conversationId
 * @param {number} [limit=500]
 * @returns {Promise<Array>}
 */
export async function listRecentMessages(conversationId, limit = 500) {
  const capped = Math.max(1, Math.min(Number(limit) || 500, 2000));

  const items = await col()
    .find({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })   // mới nhất trước
    .limit(capped)
    .toArray();

  // Đảo lại thành cũ → mới
  items.reverse();

  return items;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteMessagesByConversation(conversationId) {
  const res = await col().deleteMany({
    conversationId: String(conversationId),
  });
  return res.deletedCount;
}