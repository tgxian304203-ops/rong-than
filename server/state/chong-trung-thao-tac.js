// server/state/chong-trung-thao-tac.js
// Nhiệm vụ: Chống thực hiện trùng.
// Ví dụ: User bấm gửi 2 lần → chỉ 1 request được xử lý.
//        BOSS gọi Sandbox 2 lần cho cùng code → chỉ 1 lần chạy.

import crypto from "node:crypto";

// ============================================================
// BỘ NHỚ ĐỆM IDEMPOTENCY KEY
// ============================================================

const DEDUPE = new Map(); // key → { createdAt, result }

const TTL_MS = 5 * 60 * 1000; // 5 phút

// ============================================================
// TẠO KEY
// ============================================================

/**
 * Sinh key duy nhất từ nội dung.
 */
export function makeDedupeKey(...parts) {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    h.update(String(p ?? ""));
    h.update("|");
  }
  return h.digest("hex");
}

// ============================================================
// KIỂM TRA + CHẠY 1 LẦN
// ============================================================

/**
 * Nếu key đã có kết quả trong TTL → trả lại kết quả đó.
 * Nếu chưa → chạy fn, lưu kết quả, trả về.
 *
 * @param {string} key
 * @param {() => Promise<any>} fn
 */
export async function once(key, fn) {
  const now = Date.now();

  const existing = DEDUPE.get(key);
  if (existing && now - existing.createdAt < TTL_MS) {
    return existing.result;
  }

  const result = await fn();
  DEDUPE.set(key, { createdAt: now, result });
  return result;
}

// ============================================================
// XÓA / DỌN
// ============================================================

export function forget(key) {
  DEDUPE.delete(key);
}

export function cleanup() {
  const now = Date.now();
  for (const [k, v] of DEDUPE.entries()) {
    if (now - v.createdAt >= TTL_MS) DEDUPE.delete(k);
  }
}

setInterval(cleanup, TTL_MS).unref?.();

export default {
  makeDedupeKey,
  once,
  forget,
  cleanup,
};