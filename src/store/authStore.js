// src/store/authStore.js
// Nhiệm vụ: Quản lý trạng thái đăng nhập toàn app
// - User hiện tại, token
// - Đăng nhập / đăng ký / đăng xuất
// - Đổi ID, đổi mật khẩu, xóa tài khoản
// - Đồng bộ với api/auth.js và client.js
// Dùng React Context để share toàn app.

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as authApi from "../api/auth.js";
import { getToken, setToken, clearToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ============================================================
  // KHỞI ĐỘNG: kiểm tra token có sẵn
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const token = getToken();
      if (!token) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      try {
        const res = await authApi.me();
        if (!cancelled) {
          setUser(res?.user || null);
        }
      } catch {
        if (!cancelled) {
          clearToken();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ============================================================
  // ĐĂNG NHẬP
  // ============================================================
  const login = useCallback(async ({ userId, password }) => {
    setError(null);
    try {
      const res = await authApi.login({ userId, password });
      if (res?.token) setToken(res.token);
      setUser(res?.user || null);
      return { ok: true, user: res?.user };
    } catch (err) {
      setError(err?.message || "Đăng nhập thất bại");
      return { ok: false, error: err?.message || "Đăng nhập thất bại" };
    }
  }, []);

  // ============================================================
  // ĐĂNG KÝ
  // ============================================================
  const register = useCallback(async ({ userId, password, confirmPassword }) => {
    setError(null);
    try {
      const res = await authApi.register({ userId, password, confirmPassword });
      if (res?.token) setToken(res.token);
      setUser(res?.user || null);
      return { ok: true, user: res?.user };
    } catch (err) {
      setError(err?.message || "Đăng ký thất bại");
      return { ok: false, error: err?.message || "Đăng ký thất bại" };
    }
  }, []);

  // ============================================================
  // ĐĂNG XUẤT
  // ============================================================
  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  // ============================================================
  // ĐỔI ID
  // ============================================================
  const changeUserId = useCallback(async ({ currentPassword, newUserId }) => {
    setError(null);
    try {
      const res = await authApi.changeUserId({ currentPassword, newUserId });
      setUser((prev) => (prev ? { ...prev, userId: newUserId } : prev));
      return { ok: true, user: res?.user };
    } catch (err) {
      const msg = err?.message || "Đổi ID thất bại";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  // ============================================================
  // ĐỔI MẬT KHẨU
  // ============================================================
  const changePassword = useCallback(
    async ({ currentPassword, newPassword, confirmPassword }) => {
      setError(null);
      try {
        await authApi.changePassword({
          currentPassword,
          newPassword,
          confirmPassword,
        });
        return { ok: true };
      } catch (err) {
        const msg = err?.message || "Đổi mật khẩu thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

  // ============================================================
  // XÓA TÀI KHOẢN
  // ============================================================
  const deleteAccount = useCallback(async ({ currentPassword, confirmText }) => {
    setError(null);
    try {
      await authApi.deleteAccount({ currentPassword, confirmText });
      setUser(null);
      clearToken();
      return { ok: true };
    } catch (err) {
      const msg = err?.message || "Xóa tài khoản thất bại";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      changeUserId,
      changePassword,
      deleteAccount,
    }),
    [user, loading, error, login, register, logout, changeUserId, changePassword, deleteAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth phải dùng bên trong <AuthProvider>");
  }
  return ctx;
}