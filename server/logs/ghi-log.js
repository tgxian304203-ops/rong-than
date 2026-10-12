// server/logs/ghi-log.js
// Nhiệm vụ: Ghi log hệ thống — vừa ra console, vừa vào MongoDB.
// - Tự động che key/mật khẩu trước khi ghi
// - Tôn trọng ngưỡng LOG_LEVEL trong .env
// - Không làm sập luồng chính nếu DB lỗi

import { env } from "../config/env.js";
import { shouldLog, normalizeLevel, LOG_LEVELS } from "./muc-log.js";
import { maskString, maskObject } from "./che-du-lieu.js";

// ============================================================
// GHI LOG CHÍNH
// ============================================================

/**
 * @param {string} level  - "debug" | "info" | "warn" | "error"
 * @param {string} message
 * @param {object} [meta]
 */
export async function ghiLog(level, message, meta = null) {
  const lv = normalizeLevel(level);

  if (!shouldLog(lv, env.LOG_LEVEL)) return;

  const safeMsg = maskString(String(message ?? ""));
  const safeMeta = meta ? maskObject(meta) : null;

  // In ra console
  const ts = new Date().toISOString();
  const tag = `[Rồng Thần][${lv.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  const fn =
    lv === "error" ? console.error : lv === "warn" ? console.warn : console.log;
  fn(`${tag} ${safeMsg}`, safeMeta ? safeMeta : "");

  // Ghi vào MongoDB — chỉ khi đã kết nối
  try {
    const db = global.__rongThanDB__;
    if (db) {
      await db.collection("systemLogs").insertOne({
        level: lv,
        message: safeMsg,
        meta: safeMeta,
        timestamp: new Date(),
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[Rồng Thần][ERROR] Không ghi được log vào DB: ${maskString(
        String(err?.message || err)
      )}`
    );
  }
}

// ============================================================
// SHORTHAND
// ============================================================

export function logDebug(message, meta) {
  return ghiLog(LOG_LEVELS.DEBUG, message, meta);
}
export function logInfo(message, meta) {
  return ghiLog(LOG_LEVELS.INFO, message, meta);
}
export function logWarn(message, meta) {
  return ghiLog(LOG_LEVELS.WARN, message, meta);
}
export function logError(message, meta) {
  return ghiLog(LOG_LEVELS.ERROR, message, meta);
}

export default {
  ghiLog,
  logDebug,
  logInfo,
  logWarn,
  logError,
};