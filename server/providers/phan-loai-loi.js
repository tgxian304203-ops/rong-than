// server/providers/phan-loai-loi.js
// Nhiệm vụ: Phân loại lỗi khi gọi provider.
// Phân loại đúng để biết:
//   - Có nên thử lại không
//   - Có nên xoay key không
//   - Có nên bỏ qua model không

// ============================================================
// LOẠI LỖI
// ============================================================

export const ERROR_TYPE = {
  // Mạng / timeout
  NETWORK: "network",
  TIMEOUT: "timeout",

  // Key
  INVALID_KEY: "invalid_key",
  NO_QUOTA: "no_quota",           // 429
  RATE_LIMITED: "rate_limited",   // 429 (tạm thời)

  // Model
  MODEL_NOT_FOUND: "model_not_found",
  MODEL_UNAVAILABLE: "model_unavailable",

  // Yêu cầu
  BAD_REQUEST: "bad_request",     // 400
  CONTEXT_TOO_LONG: "context_too_long",

  // Server
  SERVER_ERROR: "server_error",   // 5xx

  // Khác
  UNKNOWN: "unknown",
};

// ============================================================
// PHÂN LOẠI TỪ HTTP STATUS
// ============================================================

export function classifyHttpStatus(status, message = "") {
  const msg = String(message).toLowerCase();

  if (status === 400) {
    if (msg.includes("context") && msg.includes("long")) {
      return ERROR_TYPE.CONTEXT_TOO_LONG;
    }
    return ERROR_TYPE.BAD_REQUEST;
  }

  if (status === 401 || status === 403) {
    return ERROR_TYPE.INVALID_KEY;
  }

  if (status === 404) {
    if (msg.includes("model")) return ERROR_TYPE.MODEL_NOT_FOUND;
    return ERROR_TYPE.UNKNOWN;
  }

  if (status === 429) {
    if (msg.includes("quota") || msg.includes("exceeded")) {
      return ERROR_TYPE.NO_QUOTA;
    }
    return ERROR_TYPE.RATE_LIMITED;
  }

  if (status >= 500) {
    return ERROR_TYPE.SERVER_ERROR;
  }

  return ERROR_TYPE.UNKNOWN;
}

// ============================================================
// PHÂN LOẠI TỪ LỖI JS
// ============================================================

export function classifyError(err) {
  if (!err) return ERROR_TYPE.UNKNOWN;

  if (err.name === "AbortError") return ERROR_TYPE.TIMEOUT;

  const code = err.code || "";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return ERROR_TYPE.NETWORK;
  }
  if (code === "ETIMEDOUT") return ERROR_TYPE.TIMEOUT;

  const msg = String(err.message || "").toLowerCase();
  if (msg.includes("timeout")) return ERROR_TYPE.TIMEOUT;
  if (msg.includes("network") || msg.includes("fetch failed")) {
    return ERROR_TYPE.NETWORK;
  }

  return ERROR_TYPE.UNKNOWN;
}

// ============================================================
// QUYẾT ĐỊNH XỬ LÝ
// ============================================================

/**
 * Có nên thử lại không?
 * - Lỗi mạng / timeout / 5xx → CÓ
 * - Hết quota / key sai → KHÔNG (phải xoay key)
 */
export function shouldRetry(errorType) {
  return [
    ERROR_TYPE.NETWORK,
    ERROR_TYPE.TIMEOUT,
    ERROR_TYPE.SERVER_ERROR,
    ERROR_TYPE.RATE_LIMITED,
  ].includes(errorType);
}

/**
 * Có nên xoay key không?
 * - Hết quota / key sai → CÓ
 * - Lỗi model → KHÔNG (xoay model)
 */
export function shouldRotateKey(errorType) {
  return [ERROR_TYPE.NO_QUOTA, ERROR_TYPE.INVALID_KEY].includes(errorType);
}

/**
 * Có nên bỏ qua model này không?
 * - Model không tồn tại / không khả dụng → CÓ
 */
export function shouldSkipModel(errorType) {
  return [
    ERROR_TYPE.MODEL_NOT_FOUND,
    ERROR_TYPE.MODEL_UNAVAILABLE,
    ERROR_TYPE.CONTEXT_TOO_LONG,
  ].includes(errorType);
}

export default {
  ERROR_TYPE,
  classifyHttpStatus,
  classifyError,
  shouldRetry,
  shouldRotateKey,
  shouldSkipModel,
};