// server/db/daiNaoKeys.js
// Nhiệm vụ: Collection daiNaoKeys — key của Đại Não.
// Quy tắc dự án:
//   - Đại Não và Tiểu Não ĐỘC LẬP key hoàn toàn.
//   - Không trộn key giữa hai tầng.
//   - Xoay key theo vòng lặp khi hết quota.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function daiNaoKeysCol() {
  return col(COLLECTIONS.daiNaoKeys);
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
    provider, // "groq" | "gemini" | "openrouter"
    rawKey,
    maskedKey,
    quota, // "ok" | "out"
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
  };
  const res = await daiNaoKeysCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listKeys(userId) {
  return daiNaoKeysCol()
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function listKeysByProvider(userId, provider) {
  return daiNaoKeysCol()
    .find({ userId, provider })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getKey(userId, keyId) {
  const _id = toObjectId(keyId);
  if (!_id) return null;
  return daiNaoKeysCol().findOne({ _id, userId });
}

export async function countKeys(userId) {
  return daiNaoKeysCol().countDocuments({ userId });
}

// ============================================================
// CẬP NHẬT QUOTA
// ============================================================

export async function updateQuota(keyId, quota) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await daiNaoKeysCol().updateOne(
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
  const res = await daiNaoKeysCol().deleteOne({ _id, userId });
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