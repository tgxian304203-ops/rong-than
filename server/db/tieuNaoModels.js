// server/db/tieuNaoModels.js
// Nhiệm vụ: Collection tieuNaoModels — model của Tiểu Não.
// Lưu model theo loại nhiệm vụ:
//   viết code, sửa lỗi, phân tích, đọc tài liệu dài,
//   tóm tắt, tra cứu, tác vụ khối lượng lớn.
// Quy tắc dự án:
//   - Tiểu Não chỉ dùng key của Tiểu Não.
//   - Chọn model theo nhiệm vụ.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function tieuNaoModelsCol() {
  return col(COLLECTIONS.tieuNaoModels);
}

// ============================================================
// GHI MODEL
// ============================================================

export async function upsertModel({
  tier = "tieu-nao",
  taskType,
  name,
  provider,
  priority = 1,
}) {
  const now = new Date();
  const res = await tieuNaoModelsCol().updateOne(
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
  return tieuNaoModelsCol()
    .find({ tier: "tieu-nao", taskType })
    .sort({ priority: 1 })
    .toArray();
}

export async function listAll() {
  return tieuNaoModelsCol()
    .find({ tier: "tieu-nao" })
    .sort({ taskType: 1, priority: 1 })
    .toArray();
}

export async function getActiveModel(taskType) {
  return tieuNaoModelsCol().findOne(
    { tier: "tieu-nao", taskType, isActive: true },
    { sort: { priority: 1 } }
  );
}

// ============================================================
// ĐẶT MODEL ĐANG SỬ DỤNG
// ============================================================

export async function setActiveModel(taskType, modelName) {
  const now = new Date();

  await tieuNaoModelsCol().updateMany(
    { tier: "tieu-nao", taskType },
    { $set: { isActive: false, updatedAt: now } }
  );

  const res = await tieuNaoModelsCol().updateOne(
    { tier: "tieu-nao", taskType, name: modelName },
    { $set: { isActive: true, updatedAt: now } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteModel(taskType, name, provider) {
  const res = await tieuNaoModelsCol().deleteOne({
    tier: "tieu-nao",
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