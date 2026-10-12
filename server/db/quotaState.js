// server/db/quotaState.js
// Nhiệm vụ: Collection quotaState — trạng thái quota của từng key.

const COL_NAME = "quotaState";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function setQuota({ tier, keyId, quota, note = "" }) {
  const now = new Date();
  const res = await col().updateOne(
    { tier, keyId: String(keyId) },
    {
      $set: {
        tier,
        keyId: String(keyId),
        quota,
        note,
        lastCheckedAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

export async function get(tier, keyId) {
  return col().findOne({ tier, keyId: String(keyId) });
}

export async function listByTier(tier) {
  return col().find({ tier }).toArray();
}

export async function listAvailableKeys(tier) {
  return col().find({ tier, quota: "ok" }).toArray();
}

export async function remove(tier, keyId) {
  const res = await col().deleteOne({ tier, keyId: String(keyId) });
  return res.deletedCount > 0;
}

export async function clearTier(tier) {
  const res = await col().deleteMany({ tier });
  return res.deletedCount;
}