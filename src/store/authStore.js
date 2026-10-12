// src/store/authStore.js
// Nhiệm vụ: Quản lý trạng thái đăng nhập toàn app.
// Dự án KHÔNG dùng JWT — xác thực bằng cách lưu userId
// và gửi kèm header X-User-Id cho mọi request.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import * as authApi from "../api/auth.js";
import {
  getStoredUserId,
  setStoredUserId,
  clearStoredUserId,
} from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ============================================================
  // KHỞI ĐỘNG: đọc userId đã lưu
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stored = getStoredUserId();
      if (!stored) {
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
          clearStoredUserId();
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
      if (res?.user?.userId) {
        setStoredUserId(res.user.userId);
        setUser(res.user);
      }
      return { ok: true, user: res?.user };
    } catch (err) {
      const msg = err?.message || "Đăng nhập thất bại";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  // ============================================================
  // ĐĂNG KÝ
  // ============================================================
  const register = useCallback(
    async ({ userId, password, confirmPassword }) => {
      setError(null);
      try {
        const res = await authApi.register({
          userId,
          password,
          confirmPassword,
        });
        if (res?.user?.userId) {
          setStoredUserId(res.user.userId);
          setUser(res.user);
        }
        return { ok: true, user: res?.user };
      } catch (err) {
        const msg = err?.message || "Đăng ký thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

  // ============================================================
  // ĐĂNG XUẤT
  // ============================================================
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* bỏ qua */
    }
    clearStoredUserId();
    setUser(null);
  }, []);

  // ============================================================
  // ĐỔI ID
  // ============================================================
  const changeUserId = useCallback(
    async ({ currentPassword, newUserId }) => {
      setError(null);
      try {
        const res = await authApi.changeUserId({
          currentPassword,
          newUserId,
        });
        if (res?.user?.userId) {
          setStoredUserId(res.user.userId);
          setUser(res.user);
        }
        return { ok: true, user: res?.user };
      } catch (err) {
        const msg = err?.message || "Đổi ID thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

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
  const deleteAccount = useCallback(
    async ({ currentPassword, confirmText }) => {
      setError(null);
      try {
        await authApi.deleteAccount({ currentPassword, confirmText });
        clearStoredUserId();
        setUser(null);
        return { ok: true };
      } catch (err) {
        const msg = err?.message || "Xóa tài khoản thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

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
    [
      user,
      loading,
      error,
      login,
      register,
      logout,
      changeUserId,
      changePassword,
      deleteAccount,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth phải dùng bên trong <AuthProvider>");
  }
  return ctx;
}