// server/dai-nao/model-dang-su-dung.js
// Nhiệm vụ: Đọc/ghi model Đại Não đang sử dụng cho từng loại nhiệm vụ.
// Quy tắc dự án:
//   - Khi BOSS hết quota/lỗi → Đại Não gọi BOSS mới từ key Đại Não.
//   - Ghi lại model đang dùng để truy vết.

import {
  setActiveModel,
  getActiveModel,
  listAll,
} from "../db/daiNaoModels.js";

// ============================================================
// ĐỌC
// ============================================================

/**
 * @param {string} taskType - "classify" | "select-model" | "call-boss"
 */
export async function layModelDangSuDung(taskType) {
  return getActiveModel(taskType);
}

export async function lietKeModelDangSuDung() {
  const all = await listAll();
  const active = {};
  for (const m of all) {
    if (m.isActive) active[m.taskType] = m;
  }
  return active;
}

// ============================================================
// GHI
// ============================================================

/**
 * Đặt model đang sử dụng cho 1 taskType.
 */
export async function datModelDangSuDung(taskType, modelName) {
  return setActiveModel(taskType, modelName);
}

export default {
  layModelDangSuDung,
  lietKeModelDangSuDung,
  datModelDangSuDung,
};