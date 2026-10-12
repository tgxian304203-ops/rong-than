// shared/validators/userRules.js
// Nhiệm vụ: Quy tắc kiểm tra ID tài khoản và mật khẩu.
// Dùng chung cho cả frontend (src/utils/validate.js) và backend (routes/auth.js).

// ============================================================
// ID TÀI KHOẢN
// ============================================================
// Quy tắc: 4-32 ký tự, bắt đầu bằng chữ cái, chỉ chứa a-z 0-9 _ -
// Ví dụ hợp lệ: user_12345, dragon01, rong_than

export const USER_ID_MIN = 4;
export const USER_ID_MAX = 32;
export const USER_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/;

export function validateUserId(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "ID không được để trống" };
  }
  const trimmed = id.trim();
  if (trimmed.length < USER_ID_MIN) {
    return { ok: false, error: `ID phải có ít nhất ${USER_ID_MIN} ký tự` };
  }
  if (trimmed.length > USER_ID_MAX) {
    return { ok: false, error: `ID không được vượt quá ${USER_ID_MAX} ký tự` };
  }
  if (!USER_ID_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: "ID chỉ gồm chữ, số, dấu _ và -, phải bắt đầu bằng chữ cái",
    };
  }
  return { ok: true, value: trimmed };
}

// ============================================================
// MẬT KHẨU
// ============================================================

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;

export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { ok: false, error: "Mật khẩu không được để trống" };
  }
  if (password.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự`,
    };
  }
  if (password.length > PASSWORD_MAX) {
    return {
      ok: false,
      error: `Mật khẩu không được vượt quá ${PASSWORD_MAX} ký tự`,
    };
  }
  return { ok: true, value: password };
}

export function validatePasswordConfirm(password, confirm) {
  if (password !== confirm) {
    return { ok: false, error: "Mật khẩu xác nhận không khớp" };
  }
  return { ok: true };
}

// ============================================================
// ĐĂNG KÝ / ĐĂNG NHẬP
// ============================================================

/**
 * Kiểm tra toàn bộ payload đăng ký.
 * @returns {{ok: boolean, value?: {userId, password}, error?: string}}
 */
export function validateRegister({ userId, password, confirmPassword }) {
  const idCheck = validateUserId(userId);
  if (!idCheck.ok) return idCheck;

  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) return pwCheck;

  const cfCheck = validatePasswordConfirm(password, confirmPassword);
  if (!cfCheck.ok) return cfCheck;

  return { ok: true, value: { userId: idCheck.value, password: pwCheck.value } };
}

/**
 * Kiểm tra payload đăng nhập.
 */
export function validateLogin({ userId, password }) {
  const idCheck = validateUserId(userId);
  if (!idCheck.ok) return idCheck;

  if (!password || typeof password !== "string") {
    return { ok: false, error: "Mật khẩu không được để trống" };
  }

  return { ok: true, value: { userId: idCheck.value, password } };
}

export default {
  USER_ID_MIN,
  USER_ID_MAX,
  USER_ID_REGEX,
  PASSWORD_MIN,
  PASSWORD_MAX,
  validateUserId,
  validatePassword,
  validatePasswordConfirm,
  validateRegister,
  validateLogin,
};