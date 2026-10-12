// server/sandbox/gioi-han-tai-nguyen.js
// Nhiệm vụ: Giới hạn tài nguyên khi chạy Sandbox.
// - Thời gian chạy tối đa
// - Kích thước code tối đa
// - Số lượt chạy đồng thời tối đa
// Đảm bảo 1 đoạn code lỗi không treo cả server.

import { LIMITS } from "../config/limits.js";

// ============================================================
// NGƯỠNG
// ============================================================

export const SANDBOX_LIMITS = {
  TIMEOUT_MS: LIMITS.SANDBOX_TIMEOUT_MS,
  MAX_CODE_BYTES: 200 * 1024,         // 200 KB code
  MAX_TEST_CODE_BYTES: 200 * 1024,    // 200 KB test
  MAX_STDOUT_BYTES: 100 * 1024,       // 100 KB output
  MAX_CONCURRENT_RUNS: 3,
};

// ============================================================
// ĐẾM SỐ LƯỢT CHẠY ĐỒNG THỜI
// ============================================================

let running = 0;

export function canRun() {
  return running < SANDBOX_LIMITS.MAX_CONCURRENT_RUNS;
}

export function enterRun() {
  running += 1;
}

export function exitRun() {
  if (running > 0) running -= 1;
}

export function currentRunning() {
  return running;
}

// ============================================================
// KIỂM TRA KÍCH THƯỚC
// ============================================================

export function checkCodeSize(code, isTest = false) {
  if (typeof code !== "string") {
    return { ok: false, error: "Code không phải chuỗi" };
  }
  const bytes = Buffer.byteLength(code, "utf8");
  const max = isTest
    ? SANDBOX_LIMITS.MAX_TEST_CODE_BYTES
    : SANDBOX_LIMITS.MAX_CODE_BYTES;

  if (bytes > max) {
    return {
      ok: false,
      error: `Code vượt quá giới hạn (${Math.round(max / 1024)} KB)`,
    };
  }
  return { ok: true };
}

// ============================================================
// CẮT OUTPUT NẾU QUÁ DÀI
// ============================================================

export function truncateOutput(text) {
  if (typeof text !== "string") return "";
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= SANDBOX_LIMITS.MAX_STDOUT_BYTES) return text;
  // Cắt theo byte an toàn
  const buf = Buffer.from(text, "utf8").slice(0, SANDBOX_LIMITS.MAX_STDOUT_BYTES);
  return buf.toString("utf8") + "\n…[đã cắt bớt do quá dài]";
}

export default {
  SANDBOX_LIMITS,
  canRun,
  enterRun,
  exitRun,
  currentRunning,
  checkCodeSize,
  truncateOutput,
};