// server/config/limits.js
// Nhiệm vụ: Giới hạn hoạt động của backend.

import { env } from "./env.js";

export const LIMITS = {
  // ============================================================
  // GỌI PROVIDER
  // ============================================================
  PROVIDER_TIMEOUT_MS: 30000,
  PROVIDER_MAX_RETRIES: 3,
  PROVIDER_RETRY_DELAY_MS: 500,

  // ============================================================
  // XOAY KEY
  // ============================================================
  KEY_ROTATION_MAX_ROUNDS: 5,

  // ============================================================
  // DÒ MODEL
  // ============================================================
  MODEL_SCAN_TIMEOUT_MS: 15000,

  // ============================================================
  // SANDBOX
  // ============================================================
  SANDBOX_TIMEOUT_MS: env.SANDBOX_TIMEOUT_MS,

  // Số vòng lặp sửa code tối đa.
  // Giảm xuống 3 để tránh Render timeout (free tier 100s).
  SANDBOX_MAX_FIX_ITERATIONS: 3,

  // ============================================================
  // TIN NHẮN / TỆP
  // ============================================================
  MAX_UPLOAD_BYTES: env.MAX_UPLOAD_MB * 1024 * 1024,
  MAX_ATTACHMENTS_PER_MESSAGE: 10,
  MAX_MESSAGE_LENGTH: 20000,

  // ============================================================
  // DỰ ÁN / HỘI THOẠI
  // ============================================================
  MAX_PROJECT_NAME_LENGTH: 80,
  MAX_CONVERSATION_TITLE_LENGTH: 120,
  RECENT_CONVERSATIONS_DISPLAY_LIMIT: 10,

  // ============================================================
  // LOGS
  // ============================================================
  LOG_MAX_ITEMS: env.LOG_MAX_ITEMS,
  LOGS_DEFAULT_LIMIT: 200,
  LOGS_MAX_LIMIT: 1000,

  // ============================================================
  // ID TÀI KHOẢN
  // ============================================================
  USER_ID_MIN: 4,
  USER_ID_MAX: 32,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
};

export default LIMITS;