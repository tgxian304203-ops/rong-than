// server/providers/retry.js
// Nhiệm vụ: Thử lại khi gọi provider lỗi tạm thời.
// Chỉ thử lại với lỗi mạng / timeout / 5xx.
// Hết quota hoặc key sai → KHÔNG thử lại (phải xoay key).

import { LIMITS } from "../config/limits.js";
import {
  classifyError,
  classifyHttpStatus,
  shouldRetry,
} from "./phan-loai-loi.js";

// ============================================================
// CHỜ
// ============================================================

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// RETRY
// ============================================================

/**
 * Chạy fn và thử lại khi lỗi.
 * @param {() => Promise<any>} fn
 * @param {object} [opts]
 * @param {number} [opts.maxRetries]
 * @param {number} [opts.delayMs]
 * @param {AbortSignal} [opts.signal]
 */
export async function withRetry(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? LIMITS.PROVIDER_MAX_RETRIES;
  const baseDelay = opts.delayMs ?? LIMITS.PROVIDER_RETRY_DELAY_MS;
  const signal = opts.signal;

  let attempt = 0;
  let lastErr;

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      const e = new Error("Đã hủy");
      e.name = "AbortError";
      throw e;
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const type = classifyError(err);

      if (!shouldRetry(type) || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff: baseDelay * 2^attempt
      const wait = baseDelay * Math.pow(2, attempt);
      await sleep(wait);
      attempt += 1;
    }
  }

  throw lastErr;
}

// ============================================================
// RETRY THEO HTTP STATUS
// ============================================================

/**
 * Nếu response có status lỗi → ném lỗi đã phân loại.
 * Trả về response nếu OK.
 */
export function assertOkResponse(status, body, url = "") {
  if (status >= 200 && status < 300) return;

  const message =
    (body && typeof body === "object" && (body.error?.message || body.message)) ||
    (typeof body === "string" ? body : `HTTP ${status}`);
  const type = classifyHttpStatus(status, String(message));

  const err = new Error(message);
  err.status = status;
  err.errorType = type;
  err.url = url;
  throw err;
}

export default {
  withRetry,
  assertOkResponse,
};