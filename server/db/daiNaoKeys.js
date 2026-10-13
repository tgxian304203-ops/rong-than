// server/db/daiNaoKeys.js
// Nhiệm vụ: Collection daiNaoKeys.

import { ObjectId } from "mongodb";

const COL_NAME = "daiNaoKeys";
const QUOTA_RESET_MS = 60 * 60 * 1000; // 1 giờ

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function addKey({
  userId,
  provider,
  rawKey,
  maskedKey,
  quota = "ok",
}) {
  const now = new Date();
  const doc = {
    userId,
    provider,
    rawKey,
    maskedKey,
    quota,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listKeys(userId) {
  await resetExpiredQuota(userId);
  return col().find({ userId }).sort({ createdAt: -1 }).toArray();
}

export async function listKeysByProvider(userId, provider) {
  await resetExpiredQuota(userId);
  return col()
    .find({ userId, provider })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getKey(userId, keyId) {
  const _id = toObjectId(keyId);
  if (!_id) return null;
  return col().findOne({ _id, userId });
}

export async function countKeys(userId) {
  return col().countDocuments({ userId });
}

export async function updateQuota(keyId, quota) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { quota, lastCheckedAt: new Date(), updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

/**
 * Reset quota "out" → "ok" nếu đã qua 1 giờ.
 */
export async function resetExpiredQuota(userId) {
  const cutoff = new Date(Date.now() - QUOTA_RESET_MS);
  try {
    await col().updateMany(
      {
        userId,
        quota: "out",
        lastCheckedAt: { $lte: cutoff },
      },
      {
        $set: { quota: "ok", updatedAt: new Date() },
      }
    );
  } catch {
    /* bỏ qua */
  }
}

export async function deleteKey(userId, keyId) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await col().deleteOne({ _id, userId });
  return res.deletedCount > 0;
}

export async function deleteKeysByUser(userId) {
  const res = await col().deleteMany({ userId });
  return res.deletedCount;
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}