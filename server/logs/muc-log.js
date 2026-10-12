// server/logs/muc-log.js
// Nhiệm vụ: Định nghĩa các mức log + thứ tự ưu tiên.
// Các mức theo đặc tả PHẦN 04, mục 20:
//   INFO / WARN / ERROR / DEBUG

export const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
};

// Thứ tự ưu tiên: số càng cao càng nghiêm trọng
export const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Danh sách mức hợp lệ
export const VALID_LEVELS = Object.keys(LEVEL_PRIORITY);

export function isValidLevel(level) {
  return VALID_LEVELS.includes(String(level).toLowerCase());
}

export function normalizeLevel(level) {
  const l = String(level || "").toLowerCase();
  return isValidLevel(l) ? l : LOG_LEVELS.INFO;
}

/**
 * Kiểm tra level có được ghi hay không dựa theo ngưỡng tối thiểu.
 * Ví dụ: ngưỡng = "warn" → bỏ qua "debug", "info".
 */
export function shouldLog(level, minLevel) {
  const a = LEVEL_PRIORITY[normalizeLevel(level)] ?? 0;
  const b = LEVEL_PRIORITY[normalizeLevel(minLevel)] ?? 0;
  return a >= b;
}

export default {
  LOG_LEVELS,
  LEVEL_PRIORITY,
  VALID_LEVELS,
  isValidLevel,
  normalizeLevel,
  shouldLog,
};