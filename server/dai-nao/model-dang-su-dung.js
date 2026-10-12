// server/dai-nao/model-dang-su-dung.js
// Nhiệm vụ: Đọc/ghi model Đại Não đang sử dụng cho từng loại nhiệm vụ.

import {
  setActiveModel,
  getActiveModel,
  listAll,
} from "../db/daiNaoModels.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// ĐỌC
// ============================================================

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

export async function datModelDangSuDung(taskType, modelName) {
  const ok = await setActiveModel(taskType, modelName);
  if (ok) {
    await logInfo("Đại Não: đặt model đang sử dụng", {
      taskType,
      modelName,
    });
  }
  return ok;
}

export default {
  layModelDangSuDung,
  lietKeModelDangSuDung,
  datModelDangSuDung,
};