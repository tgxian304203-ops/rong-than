// src/api/keys.js
// Nhiệm vụ: API key cho Đại Não, Tiểu Não, Web
// - Kiểm tra key (Run) — gọi backend xác thực thật
// - Lưu key hợp lệ vào đúng nhóm
// - Lấy danh sách key theo nhóm
// - Xóa từng key
// - Lấy trạng thái quota

import api from "./client.js";

// ============================================================
// NHÓM KEY
// ============================================================
// "dai-nao" | "tieu-nao" | "web"

const VALID_GROUPS = ["dai-nao", "tieu-nao", "web"];

function assertGroup(group) {
  if (!VALID_GROUPS.includes(group)) {
    throw new Error(`Nhóm key không hợp lệ: ${group}`);
  }
}

// ============================================================
// KIỂM TRA + LƯU KEY (nút ▶ Run)
// ============================================================

/**
 * Gửi key lên backend để kiểm tra.
 * Backend sẽ xác định nhà cung cấp, kiểm tra hợp lệ, lưu nếu OK.
 * @param {string} group - "dai-nao" | "tieu-nao" | "web"
 * @param {string} rawKey - API key người dùng nhập
 * @returns {Promise<{ok: boolean, provider: string, keyId: string, maskedKey: string, quota: string}>}
 */
export async function verifyAndSaveKey(group, rawKey) {
  assertGroup(group);
  return api.post(`/keys/${group}/verify`, { key: rawKey });
}

// ============================================================
// DANH SÁCH KEY THEO NHÓM
// ============================================================

/**
 * @param {string} group
 * @returns {Promise<{ providers: { groq: KeyRow[], gemini: KeyRow[], openrouter: KeyRow[] } }>}
 * KeyRow = { id, maskedKey, provider, quota: "ok"|"out", createdAt, lastCheckedAt }
 */
export async function listKeys(group) {
  assertGroup(group);
  return api.get(`/keys/${group}`);
}

// ============================================================
// XÓA 1 KEY
// ============================================================

export async function deleteKey(group, keyId) {
  assertGroup(group);
  return api.del(`/keys/${group}/${encodeURIComponent(keyId)}`);
}

// ============================================================
// QUOTA
// ============================================================

export async function checkKeyQuota(group, keyId) {
  assertGroup(group);
  return api.post(`/keys/${group}/${encodeURIComponent(keyId)}/check-quota`, {});
}

// ============================================================
// TIỆN ÍCH NHANH
// ============================================================

export const daiNaoKeys = {
  verify: (key) => verifyAndSaveKey("dai-nao", key),
  list: () => listKeys("dai-nao"),
  remove: (keyId) => deleteKey("dai-nao", keyId),
  checkQuota: (keyId) => checkKeyQuota("dai-nao", keyId),
};

export const tieuNaoKeys = {
  verify: (key) => verifyAndSaveKey("tieu-nao", key),
  list: () => listKeys("tieu-nao"),
  remove: (keyId) => deleteKey("tieu-nao", keyId),
  checkQuota: (keyId) => checkKeyQuota("tieu-nao", keyId),
};

export const webKeys = {
  verify: (key) => verifyAndSaveKey("web", key),
  list: () => listKeys("web"),
  remove: (keyId) => deleteKey("web", keyId),
  checkQuota: (keyId) => checkKeyQuota("web", keyId),
};