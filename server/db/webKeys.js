// server/db/webKeys.js
// Nhiệm vụ: Collection webKeys — key của Web.
// Quy tắc dự án:
//   - Web độc lập với Đại Não và Tiểu Não.
//   - 3 nhà cung cấp: Tavily, SerpJet, Brave Search.
//   - KHÔNG tự đổi tên SerpJet thành nhà cung cấp khác.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function webKeysCol() {
  return col(COLLECTIONS.webKeys);
}

// ============================================================
// TẠO
// ============================================================

export async function addKey({
  userId,
  provider, // "tavily" | "serpjet" | "brave"
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
  const res = await webKeysCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listKeys(userId) {
  return webKeysCol()
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function listKeysByProvider(userId, provider) {
  return webKeysCol()
    .find({ userId, provider })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getKey(userId, keyId) {
  const _id = toObjectId(keyId);
  if (!_id) return null;
  return webKeysCol().findOne({ _id, userId });
}

export async function countKeys(userId) {
  return webKeysCol().countDocuments({ userId });
}

// ============================================================
// CẬP NHẬT QUOTA
// ============================================================

export async function updateQuota(keyId, quota) {
  const _id = toObjectId(keyId);
  if (!_id) return false;
  const res = await webKeysCol().updateOne(
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
  const res = await webKeysCol().deleteOne({ _id, userId });
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