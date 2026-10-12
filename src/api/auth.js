// src/api/auth.js
// Nhiệm vụ: API xác thực & tài khoản
// - Đăng ký, đăng nhập, đăng xuất
// - Lấy thông tin tài khoản hiện tại
// - Đổi ID, đổi mật khẩu, xóa tài khoản

import api, { setToken, clearToken } from "./client.js";

// ============================================================
// ĐĂNG KÝ
// ============================================================

/**
 * @param {{ userId: string, password: string, confirmPassword: string }} payload
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function register({ userId, password, confirmPassword }) {
  const res = await api.post("/auth/register", {
    userId,
    password,
    confirmPassword,
  });
  if (res?.token) setToken(res.token);
  return res;
}

// ============================================================
// ĐĂNG NHẬP
// ============================================================

/**
 * @param {{ userId: string, password: string }} payload
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function login({ userId, password }) {
  const res = await api.post("/auth/login", { userId, password });
  if (res?.token) setToken(res.token);
  return res;
}

// ============================================================
// ĐĂNG XUẤT
// ============================================================

export async function logout() {
  try {
    await api.post("/auth/logout", {});
  } catch {
    /* dù lỗi vẫn xóa token phía client */
  } finally {
    clearToken();
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
  return api.post("/auth/change-id", { currentPassword, newUserId });
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
 * confirmText phải đúng chuỗi xác nhận mà backend quy định.
 */
export async function deleteAccount({ currentPassword, confirmText }) {
  const res = await api.post("/auth/delete-account", {
    currentPassword,
    confirmText,
  });
  clearToken();
  return res;
}