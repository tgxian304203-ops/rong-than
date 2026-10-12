// server/db/modelHealth.js
// Nhiệm vụ: Collection modelHealth — trạng thái khả dụng của model.
// Dùng để biết model nào còn sống, model nào lỗi, hết quota.

import { col, COLLECTIONS } from "./index.js";

export function modelHealthCol() {
  return col(COLLECTIONS.modelHealth);
}

// ============================================================
// TRẠNG THÁI CHUẨN
// ============================================================
// "available"  — còn dùng được
// "no-quota"   — hết quota
// "error"      — đang lỗi
// "unknown"    — chưa kiểm tra

// ============================================================
// GHI / CẬP NHẬT
// ============================================================

export async function report({
  tier,          // "dai-nao" | "tieu-nao"
  modelName,
  provider,
  status,
  note = "",
}) {
  const now = new Date();
  const res = await modelHealthCol().updateOne(
    { tier, modelName, provider },
    {
      $set: {
        tier,
        modelName,
        provider,
        status,
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

export async function get(tier, modelName, provider) {
  return modelHealthCol().findOne({ tier, modelName, provider });
}

export async function listByTier(tier) {
  return modelHealthCol()
    .find({ tier })
    .sort({ updatedAt: -1 })
    .toArray();
}

/**
 * Lấy danh sách model còn khả dụng.
 */
export async function listAvailable(tier) {
  return modelHealthCol()
    .find({ tier, status: "available" })
    .toArray();
}

// ============================================================
// XÓA
// ============================================================

export async function clearTier(tier) {
  const res = await modelHealthCol().deleteMany({ tier });
  return res.deletedCount;
}

// ============================================================
// KIỂM TRA NHANH
// ============================================================

export async function isAvailable(tier, modelName, provider) {
  const doc = await get(tier, modelName, provider);
  return doc?.status === "available";
}