// server/dai-nao/kiem-tra-quota.js
// Nhiệm vụ: Kiểm tra quota của key Đại Não.
// Đọc từ collection quotaState (đã được cập nhật mỗi lần gọi provider).
// Quy tắc dự án:
//   - 🔥 còn quota, 😓 hết quota.
//   - Xoay key khi hết quota.

import { get as getQuota, setQuota } from "../db/quotaState.js";

// ============================================================
// ĐỌC
// ============================================================

/**
 * @param {string} keyId
 * @returns {Promise<"ok"|"out">}
 */
export async function layQuota(keyId) {
  const doc = await getQuota("dai-nao", keyId);
  if (!doc) return "ok";
  return doc.quota === "out" ? "out" : "ok";
}

// ============================================================
// GHI
// ============================================================

export async function datConQuota(keyId) {
  return setQuota({ tier: "dai-nao", keyId, quota: "ok" });
}

export async function datHetQuota(keyId, note = "") {
  return setQuota({ tier: "dai-nao", keyId, quota: "out", note });
}

export default {
  layQuota,
  datConQuota,
  datHetQuota,
};