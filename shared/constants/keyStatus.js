// shared/constants/keyStatus.js
// Nhiệm vụ: 10 trạng thái key.
// Dùng để theo dõi key trong quá trình dò/xoay.

export const KEY_STATUS = {
  // Key đã kiểm tra, hợp lệ, còn quota
  VALID: "valid",

  // Key hợp lệ nhưng đã hết quota
  NO_QUOTA: "no-quota",

  // Key sai (401/403) hoặc không đúng định dạng
  INVALID: "invalid",

  // Chưa kiểm tra lần nào
  UNKNOWN: "unknown",

  // Đang được dùng để gọi model
  IN_USE: "in-use",

  // Đang chờ xoay tới (còn dùng được)
  WAITING: "waiting",

  // Bị tạm khóa do lỗi tạm thời (mạng / timeout)
  TEMP_ERROR: "temp-error",

  // Đã hết hạn (ví dụ key bị thu hồi)
  EXPIRED: "expired",

  // Đang được kiểm tra (kiểm tra quota, kiểm tra hợp lệ)
  CHECKING: "checking",

  // Đã bị xóa (không dùng nữa)
  DELETED: "deleted",
};

export const KEY_STATUS_LIST = Object.values(KEY_STATUS);

export function isValidKeyStatus(status) {
  return KEY_STATUS_LIST.includes(status);
}

/**
 * Key còn dùng được để gọi model.
 */
export function isUsableKeyStatus(status) {
  return (
    status === KEY_STATUS.VALID ||
    status === KEY_STATUS.IN_USE ||
    status === KEY_STATUS.WAITING ||
    status === KEY_STATUS.UNKNOWN
  );
}

/**
 * Key cần xoay khi gặp trạng thái này.
 */
export function shouldRotateKey(status) {
  return (
    status === KEY_STATUS.NO_QUOTA ||
    status === KEY_STATUS.INVALID ||
    status === KEY_STATUS.EXPIRED
  );
}

export default {
  KEY_STATUS,
  KEY_STATUS_LIST,
  isValidKeyStatus,
  isUsableKeyStatus,
  shouldRotateKey,
};