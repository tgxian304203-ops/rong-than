// server/dai-nao/xoay-key.js
// Nhiệm vụ: Xoay key theo vòng lặp khi hết quota.
// Quy tắc dự án (PHẦN 01, mục 12):
//   - Nếu 1 key hết quota → xoay qua key tiếp theo.
//   - Nếu có nhiều key giống nhau (3 Groq, 3 Gemini, 3 OpenRouter)
//     → phải xoay ĐỦ theo vòng lặp. KHÔNG được tự ý bỏ qua.
//   - Đại Não chỉ dùng key của Đại Não.

import { LIMITS } from "../config/limits.js";
import { listKeysByProvider, updateQuota } from "../db/daiNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN KEY TIẾP THEO
// ============================================================

/**
 * Duyệt key theo vòng lặp, trả về key khả dụng đầu tiên.
 * Key đã có quota = "out" bị bỏ qua (không thử lại).
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.provider
 * @returns {Promise<object|null>}
 */
export async function chonKeyTiepTheo({ userId, provider }) {
  const keys = await listKeysByProvider(userId, provider);
  if (!keys || keys.length === 0) return null;

  // Xoay đủ vòng: lặp KEY_ROTATION_MAX_ROUNDS lần
  for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
    for (const key of keys) {
      if (key.quota !== "out") {
        return key;
      }
    }
  }

  return null;
}

// ============================================================
// ĐÁNH DẤU KEY HẾT QUOTA
// ============================================================

export async function danhDauHetQuota(keyId) {
  try {
    await updateQuota(keyId, "out");
    await logWarn("Key Đại Não hết quota", { keyId: String(keyId) });
  } catch (err) {
    await logWarn("Không đánh dấu được key hết quota", {
      keyId: String(keyId),
      error: err?.message || String(err),
    });
  }
}

export default {
  chonKeyTiepTheo,
  danhDauHetQuota,
};