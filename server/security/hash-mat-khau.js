// server/security/hash-mat-khau.js
// Nhiệm vụ: Xử lý mật khẩu.
//
// GHI CHÚ QUAN TRỌNG:
//   Theo yêu cầu của chủ dự án: đăng nhập trực tiếp trên giao diện,
//   không dùng JWT, không dùng bcrypt, không dùng session.
//   File này CHỈ cung cấp các hàm tiện ích so sánh mật khẩu.
//   KHÔNG tự ý hash mật khẩu trong luồng đăng nhập/đăng ký.

// ============================================================
// SO SÁNH TRỰC TIẾP
// ============================================================

/**
 * So sánh mật khẩu người dùng nhập với mật khẩu lưu trong DB.
 * Trả về true/false.
 */
export function comparePassword(input, stored) {
  if (typeof input !== "string" || typeof stored !== "string") {
    return false;
  }
  return input === stored;
}

// ============================================================
// KIỂM TRA ĐỘ MẠNH (dùng cho UI/validator)
// ============================================================

export function isStrongEnough(password) {
  if (typeof password !== "string") return false;
  return password.length >= 6 && password.length <= 128;
}

export default {
  comparePassword,
  isStrongEnough,
};