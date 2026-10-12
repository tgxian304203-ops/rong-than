// server/config/limits.js
// Nhiệm vụ: Giới hạn hoạt động của backend.
// - Số lần thử lại khi gọi provider lỗi
// - Thời gian timeout
// - Kích thước payload, số tệp đính kèm
// - Số vòng lặp sửa code tối đa trong Sandbox

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
  // Số vòng lặp xoay key tối đa trước khi bỏ cuộc.
  // Theo dự án: phải xoay đủ vòng, không được bỏ qua.
  KEY_ROTATION_MAX_ROUNDS: 5,

  // ============================================================
  // DÒ MODEL
  // ============================================================
  MODEL_SCAN_TIMEOUT_MS: 15000,

  // ============================================================
  // SANDBOX
  // ============================================================
  SANDBOX_TIMEOUT_MS: env.SANDBOX_TIMEOUT_MS,
  // Số vòng lặp sửa code tối đa (BOSS viết format → lính sửa → chạy lại).
  // Theo dự án: lặp tới khi đúng mới thôi, nhưng vẫn cần chặn trần
  // để tránh vòng lặp vô tận khi provider lỗi liên tục.
  SANDBOX_MAX_FIX_ITERATIONS: 10,

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
  // Số hội thoại gần đây hiển thị ở lịch sử (theo đặc tả PHẦN 04, mục 8)
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