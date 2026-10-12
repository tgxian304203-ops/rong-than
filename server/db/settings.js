// server/db/settings.js
// Nhiệm vụ: Collection settings — cấu hình riêng của từng user.

const COL_NAME = "settings";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function upsertSettings(userId, patch = {}) {
  const now = new Date();
  const res = await col().updateOne(
    { userId },
    {
      $set: { ...patch, userId, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

export async function getSettings(userId) {
  const doc = await col().findOne({ userId });
  if (doc) return doc;
  return {
    userId,
    activeDaiNaoModel: null,
    activeTieuNaoModel: null,
    activeTaskType: null,
  };
}

export async function deleteSettings(userId) {
  const res = await col().deleteOne({ userId });
  return res.deletedCount > 0;
}