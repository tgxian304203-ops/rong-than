// server/tieu-nao/xoay-key.js
// Nhiệm vụ: Xoay key theo vòng lặp khi hết quota.
// Quy tắc dự án:
//   - Nếu 1 key hết quota → xoay qua key tiếp theo.
//   - Nếu có nhiều key giống nhau → xoay đủ theo vòng lặp.
//   - Tiểu Não CHỈ dùng key của Tiểu Não.

import { LIMITS } from "../config/limits.js";
import { listKeysByProvider, updateQuota } from "../db/tieuNaoKeys.js";
import { logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN KEY TIẾP THEO
// ============================================================

export async function chonKeyTiepTheo({ userId, provider }) {
  const keys = await listKeysByProvider(userId, provider);
  if (!keys || keys.length === 0) return null;

  for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
    for (const key of keys) {
      if (key.quota !== "out") return key;
    }
  }

  return null;
}

// ============================================================
// ĐÁNH DẤU HẾT QUOTA
// ============================================================

export async function danhDauHetQuota(keyId) {
  try {
    await updateQuota(keyId, "out");
    await logWarn("Key Tiểu Não hết quota", { keyId: String(keyId) });
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