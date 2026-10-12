// server/dai-nao/kiem-tra-kha-dung.js
// Nhiệm vụ: Kiểm tra model của Đại Não còn khả dụng không.
// Đọc bảng modelHealth, kết hợp thời gian kiểm tra gần nhất.
// Quy tắc dự án:
//   - Nếu model ưu tiên 1 hết quota/lỗi → chuyển ưu tiên 2.
//   - Nếu tất cả hết → hạ xuống hạng thấp hơn.

import { report, get } from "../db/modelHealth.js";

const HEALTH_TTL_MS = 5 * 60 * 1000; // 5 phút

// ============================================================
// KIỂM TRA
// ============================================================

/**
 * @returns {Promise<{available: boolean, status: string}>}
 */
export async function kiemTraKhaDung(modelName, provider) {
  const doc = await get("dai-nao", modelName, provider);
  if (!doc) {
    return { available: false, status: "unknown" };
  }

  // Nếu thông tin cũ quá → coi như chưa biết
  const age = Date.now() - new Date(doc.lastCheckedAt || 0).getTime();
  if (age > HEALTH_TTL_MS) {
    return { available: false, status: "unknown" };
  }

  return {
    available: doc.status === "available",
    status: doc.status,
  };
}

// ============================================================
// BÁO CÁO
// ============================================================

export async function baoCaoKhaDung(modelName, provider, status, note = "") {
  return report({
    tier: "dai-nao",
    modelName,
    provider,
    status,
    note,
  });
}

export async function baoCaoConDung(modelName, provider) {
  return baoCaoKhaDung(modelName, provider, "available", "");
}

export async function baoCaoHetQuota(modelName, provider) {
  return baoCaoKhaDung(modelName, provider, "no-quota", "Hết quota");
}

export async function baoCaoLoi(modelName, provider, note = "") {
  return baoCaoKhaDung(modelName, provider, "error", note);
}

export default {
  kiemTraKhaDung,
  baoCaoKhaDung,
  baoCaoConDung,
  baoCaoHetQuota,
  baoCaoLoi,
};