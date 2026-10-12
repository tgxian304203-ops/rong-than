// server/tieu-nao/do-model.js
// Nhiệm vụ: Dò model từ key Tiểu Não (Bước 1 + Bước 2).
//
// Quy tắc dự án (PHẦN 01, mục 11):
//   Bước 1: Xác nhận xem có bao nhiêu key được dán.
//   Bước 2: Xác nhận quyền truy cập model.
//
// Tiểu Não CHỈ dùng key của Tiểu Não.
// Không được dò/gọi model từ key Đại Não.

import { MODEL_PROVIDER_IDS } from "../config/providers.js";
import { listKeys, countKeys } from "../db/tieuNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { kiemTraQuyenTruyCap } from "./kiem-tra-quyen-truy-cap.js";

// ============================================================
// DÒ MODEL
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @returns {Promise<{
 *   ok: boolean,
 *   totalKeys: number,
 *   providers: Array<{ provider: string, totalKeys: number, keys: Array, models: string[], error?: string }>,
 *   allModels: string[],
 * }>}
 */
export async function doModel({ userId }) {
  // ===== BƯỚC 1: ĐẾM SỐ KEY ĐÃ DÁN =====
  const total = await countKeys(userId);
  if (total === 0) {
    return {
      ok: false,
      totalKeys: 0,
      providers: [],
      allModels: [],
      error: "Chưa có key nào được dán cho Tiểu Não",
    };
  }

  const allKeys = await listKeys(userId);

  // Nhóm key theo provider
  const byProvider = {};
  for (const id of MODEL_PROVIDER_IDS) byProvider[id] = [];
  for (const k of allKeys) {
    if (byProvider[k.provider]) byProvider[k.provider].push(k);
  }

  // ===== BƯỚC 2: XÁC NHẬN QUYỀN TRUY CẬP MODEL =====
  const providers = [];
  const allModelsSet = new Set();

  for (const providerId of MODEL_PROVIDER_IDS) {
    const keys = byProvider[providerId] || [];
    if (keys.length === 0) {
      providers.push({
        provider: providerId,
        totalKeys: 0,
        keys: [],
        models: [],
      });
      continue;
    }

    const key = keys.find((k) => k.quota !== "out") || keys[0];
    const res = await kiemTraQuyenTruyCap({
      provider: providerId,
      rawKey: key.rawKey,
    });

    if (res.ok) {
      for (const m of res.models) allModelsSet.add(`${providerId}:${m}`);
      await logInfo("Tiểu Não: dò model OK", {
        userId,
        provider: providerId,
        count: res.models.length,
      });
    } else {
      await logWarn("Tiểu Não: dò model thất bại", {
        userId,
        provider: providerId,
        error: res.error,
      });
    }

    providers.push({
      provider: providerId,
      totalKeys: keys.length,
      keys: keys.map((k) => ({
        id: String(k._id),
        maskedKey: k.maskedKey,
        quota: k.quota,
      })),
      models: res.models,
      error: res.ok ? undefined : res.error,
    });
  }

  const anyOk = providers.some((p) => p.models && p.models.length > 0);

  return {
    ok: anyOk,
    totalKeys: total,
    providers,
    allModels: Array.from(allModelsSet),
    error: anyOk ? undefined : "Không dò được model nào khả dụng",
  };
}

export default { doModel };