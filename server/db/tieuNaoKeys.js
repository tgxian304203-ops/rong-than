// server/db/tieuNaoKeys.js
// Nhiệm vụ: Collection tieuNaoKeys — key của Tiểu Não.
// Tiểu Não và Đại Não ĐỘC LẬP key hoàn toàn.

import { ObjectId } from "mongodb";

const COL_NAME = "tieuNaoKeys";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

// ============================================================
// TẠO
// ============================================================

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

// ============================================================
// ĐỌC
// ============================================================

export async function listKeys(userId) {
  return col().find({ userId }).sort({ createdAt: -1 }).toArray();
}

export async function listKeysByProvider(userId, provider) {
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

// ============================================================
// CẬP NHẬT QUOTA
// ============================================================

export async function updateQuota(keyId, quota) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await col().updateOne(
    { _id },
    { $set: { quota, lastCheckedAt: new Date(), updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteKey(userId, keyId) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await col().deleteOne({ _id, userId });
  return res.deletedCount > 0;
}

// ============================================================
// XÓA TẤT CẢ KEY TIỂU NÃO CỦA 1 USER
// ============================================================

export async function deleteKeysByUser(userId) {
  const res = await col().deleteMany({ userId });
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