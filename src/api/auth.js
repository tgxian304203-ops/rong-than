// src/api/auth.js
// Nhiệm vụ: API xác thực & tài khoản.
// Theo dự án: đăng nhập trực tiếp, không dùng JWT.
// Client lưu userId vào localStorage và gửi kèm header X-User-Id.

import api, { setStoredUserId, clearStoredUserId } from "./client.js";

// ============================================================
// ĐĂNG KÝ
// ============================================================

/**
 * @param {{ userId: string, password: string, confirmPassword: string }} payload
 * @returns {Promise<{ user: object }>}
 */
export async function register({ userId, password, confirmPassword }) {
  const res = await api.post("/auth/register", {
    userId,
    password,
    confirmPassword,
  });
  if (res?.user?.userId) setStoredUserId(res.user.userId);
  return res;
}

// ============================================================
// ĐĂNG NHẬP
// ============================================================

/**
 * @param {{ userId: string, password: string }} payload
 * @returns {Promise<{ user: object }>}
 */
export async function login({ userId, password }) {
  const res = await api.post("/auth/login", { userId, password });
  if (res?.user?.userId) setStoredUserId(res.user.userId);
  return res;
}

// ============================================================
// ĐĂNG XUẤT
// ============================================================

export async function logout() {
  try {
    await api.post("/auth/logout", {});
  } catch {
    /* dù lỗi vẫn xóa userId phía client */
  } finally {
    clearStoredUserId();
  }
}

// ============================================================
// LẤY TÀI KHOẢN HIỆN TẠI
// ============================================================

export async function me() {
  return api.get("/auth/me");
}

// ============================================================
// ĐỔI ID
// ============================================================

/**
 * @param {{ currentPassword: string, newUserId: string }} payload
 */
export async function changeUserId({ currentPassword, newUserId }) {
  const res = await api.post("/auth/change-id", {
    currentPassword,
    newUserId,
  });
  if (res?.user?.userId) setStoredUserId(res.user.userId);
  return res;
}

// ============================================================
// ĐỔI MẬT KHẨU
// ============================================================

/**
 * @param {{ currentPassword: string, newPassword: string, confirmPassword: string }} payload
 */
export async function changePassword({
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  return api.post("/auth/change-password", {
    currentPassword,
    newPassword,
    confirmPassword,
  });
}

// ============================================================
// XÓA TÀI KHOẢN
// ============================================================

/**
 * @param {{ currentPassword: string, confirmText: string }} payload
 */
export async function deleteAccount({ currentPassword, confirmText }) {
  const res = await api.post("/auth/delete-account", {
    currentPassword,
    confirmText,
  });
  clearStoredUserId();
  return res;
}