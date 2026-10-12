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

// ============================================================
// XÓA
// ============================================================

export async function deleteMessagesByConversation(conversationId) {
  const res = await col().deleteMany({
    conversationId: String(conversationId),
  });
  return res.deletedCount;
}