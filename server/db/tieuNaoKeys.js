// server/db/tieuNaoKeys.js
// Nhiệm vụ: Collection tieuNaoKeys — key của Tiểu Não.
// Quy tắc dự án:
//   - Tiểu Não và Đại Não ĐỘC LẬP key hoàn toàn.
//   - Không trộn key giữa hai tầng.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function tieuNaoKeysCol() {
  return col(COLLECTIONS.tieuNaoKeys);
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
  const res = await tieuNaoKeysCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listKeys(userId) {
  return tieuNaoKeysCol()
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function listKeysByProvider(userId, provider) {
  return tieuNaoKeysCol()
    .find({ userId, provider })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getKey(userId, keyId) {
  const _id = toObjectId(keyId);
  if (!_id) return null;
  return tieuNaoKeysCol().findOne({ _id, userId });
}

export async function countKeys(userId) {
  return tieuNaoKeysCol().countDocuments({ userId });
}

// ============================================================
// CẬP NHẬT QUOTA
// ============================================================

export async function updateQuota(keyId, quota) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await tieuNaoKeysCol().updateOne(
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
  const res = await tieuNaoKeysCol().deleteOne({ _id, userId });
  return res.deletedCount > 0;
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