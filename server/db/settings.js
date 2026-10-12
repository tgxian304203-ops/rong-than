// server/db/settings.js
// Nhiệm vụ: Collection settings — cấu hình riêng của từng user
// (model đang sử dụng, tủy chọn UI, v.v.)

import { col, COLLECTIONS } from "./index.js";

export function settingsCol() {
  return col(COLLECTIONS.settings);
}

// ============================================================
// GHI / CẬP NHẬT
// ============================================================

export async function upsertSettings(userId, patch = {}) {
  const now = new Date();
  const res = await settingsCol().updateOne(
    { userId },
    {
      $set: { ...patch, userId, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

// ============================================================
// ĐỌC
// ============================================================

export async function getSettings(userId) {
  const doc = await settingsCol().findOne({ userId });
  if (doc) return doc;
  // Chưa có → trả về mặc định (không tự tạo bản ghi)
  return {
    userId,
    activeDaiNaoModel: null,
    activeTieuNaoModel: null,
    activeTaskType: null,
  };
}

// ============================================================
// XÓA
// ============================================================

export async function deleteSettings(userId) {
  const res = await settingsCol().deleteOne({ userId });
  return res.deletedCount > 0;
}