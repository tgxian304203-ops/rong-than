// server/db/daiNaoModels.js
// Nhiệm vụ: Collection daiNaoModels — model của Đại Não.
// Lưu danh sách model ứng viên + model đang sử dụng cho từng loại nhiệm vụ.
// Quy tắc dự án:
//   - Đại Não chỉ dùng key của Đại Não.
//   - Model ưu tiên 1 → ưu tiên 2 → hạng thấp hơn.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function daiNaoModelsCol() {
  return col(COLLECTIONS.daiNaoModels);
}

// ============================================================
// GHI MODEL
// ============================================================

/**
 * Lưu hoặc cập nhật 1 model ứng viên cho 1 loại nhiệm vụ.
 * @param {object} p
 * @param {string} p.tier          - "dai-nao"
 * @param {string} p.taskType      - "classify" | "select-model" | "call-boss"
 * @param {string} p.name          - tên model (vd "openai/gpt-oss-120b")
 * @param {string} p.provider      - "groq" | "gemini" | "openrouter"
 * @param {number} p.priority      - 1 = ưu tiên 1, 2 = ưu tiên 2, ...
 */
export async function upsertModel({
  tier = "dai-nao",
  taskType,
  name,
  provider,
  priority = 1,
}) {
  const now = new Date();
  const res = await daiNaoModelsCol().updateOne(
    { tier, taskType, name, provider },
    {
      $set: {
        tier,
        taskType,
        name,
        provider,
        priority,
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

export async function listByTask(taskType) {
  return daiNaoModelsCol()
    .find({ tier: "dai-nao", taskType })
    .sort({ priority: 1 })
    .toArray();
}

export async function listAll() {
  return daiNaoModelsCol()
    .find({ tier: "dai-nao" })
    .sort({ taskType: 1, priority: 1 })
    .toArray();
}

/**
 * Lấy model đang sử dụng — model có priority nhỏ nhất và không phải trạng thái lỗi.
 * @param {string} taskType
 */
export async function getActiveModel(taskType) {
  return daiNaoModelsCol().findOne(
    { tier: "dai-nao", taskType, isActive: true },
    { sort: { priority: 1 } }
  );
}

// ============================================================
// ĐẶT MODEL ĐANG SỬ DỤNG
// ============================================================

export async function setActiveModel(taskType, modelName) {
  const now = new Date();

  // Bỏ active cũ của taskType này
  await daiNaoModelsCol().updateMany(
    { tier: "dai-nao", taskType },
    { $set: { isActive: false, updatedAt: now } }
  );

  // Đặt active mới
  const res = await daiNaoModelsCol().updateOne(
    { tier: "dai-nao", taskType, name: modelName },
    { $set: { isActive: true, updatedAt: now } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteModel(taskType, name, provider) {
  const res = await daiNaoModelsCol().deleteOne({
    tier: "dai-nao",
    taskType,
    name,
    provider,
  });
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