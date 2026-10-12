// server/db/quotaState.js
// Nhiệm vụ: Collection quotaState — trạng thái quota của từng key.
// Theo dõi key nào còn quota, key nào hết quota.
// Phục vụ xoay key theo vòng lặp.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function quotaStateCol() {
  return col(COLLECTIONS.quotaState);
}

// ============================================================
// GHI / CẬP NHẬT
// ============================================================

/**
 * @param {object} p
 * @param {string} p.tier       - "dai-nao" | "tieu-nao" | "web"
 * @param {string} p.keyId      - _id của key
 * @param {string} p.quota      - "ok" | "out"
 * @param {string} [p.note]
 */
export async function setQuota({ tier, keyId, quota, note = "" }) {
  const now = new Date();
  const res = await quotaStateCol().updateOne(
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

// ============================================================
// ĐỌC
// ============================================================

export async function get(tier, keyId) {
  return quotaStateCol().findOne({ tier, keyId: String(keyId) });
}

export async function listByTier(tier) {
  return quotaStateCol().find({ tier }).toArray();
}

/**
 * Danh sách key còn quota theo tier.
 */
export async function listAvailableKeys(tier) {
  return quotaStateCol()
    .find({ tier, quota: "ok" })
    .toArray();
}

// ============================================================
// XÓA
// ============================================================

export async function remove(tier, keyId) {
  const res = await quotaStateCol().deleteOne({
    tier,
    keyId: String(keyId),
  });
  return res.deletedCount > 0;
}

export async function clearTier(tier) {
  const res = await quotaStateCol().deleteMany({ tier });
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