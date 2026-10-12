// src/store/uiStore.js
// Nhiệm vụ: Trạng thái giao diện chung
// - Mở/đóng menu chính (trượt từ trái, phủ 100%)
// - Hộp xác nhận (ConfirmDialog)
// - Toast thông báo
// - Bàn phím ảo (mobile)

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from "react";

const UIContext = createContext(null);

let toastIdCounter = 0;

export function UIProvider({ children }) {
  // ============================================================
  // MENU CHÍNH
  // ============================================================
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  // ============================================================
  // HỘP XÁC NHẬN
  // ============================================================
  // confirmState = { open, title, message, confirmText, cancelText,
  //                  tone: "default"|"danger", resolve }
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Xác nhận",
    cancelText: "Hủy",
    tone: "default",
    resolve: null,
  });

  /**
   * Mở hộp xác nhận. Trả về Promise<boolean>.
   * @param {object} opts
   * @returns {Promise<boolean>}
   */
  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        open: true,
        title: opts.title || "Xác nhận",
        message: opts.message || "",
        confirmText: opts.confirmText || "Xác nhận",
        cancelText: opts.cancelText || "Hủy",
        tone: opts.tone || "default",
        resolve,
      });
    });
  }, []);

  const resolveConfirm = useCallback(
    (result) => {
      setConfirmState((prev) => {
        if (prev.resolve) prev.resolve(result);
        return {
          open: false,
          title: "",
          message: "",
          confirmText: "Xác nhận",
          cancelText: "Hủy",
          tone: "default",
          resolve: null,
        };
      });
    },
    []
  );

  const handleConfirmYes = useCallback(() => resolveConfirm(true), [resolveConfirm]);
  const handleConfirmNo = useCallback(() => resolveConfirm(false), [resolveConfirm]);

  // ============================================================
  // TOAST
  // ============================================================
  // Toast = { id, type: "info"|"success"|"warning"|"error", message, duration }
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 3000) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ============================================================
  // BÀN PHÍM ẢO
  // ============================================================
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const setKeyboardVisible = useCallback((v) => setKeyboardOpen(!!v), []);

  // ============================================================
  // LOADING TOÀN CỤC (dùng khi cần chặn thao tác)
  // ============================================================
  const [globalLoading, setGlobalLoading] = useState(false);

  const value = useMemo(
    () => ({
      // menu
      menuOpen,
      openMenu,
      closeMenu,
      toggleMenu,

      // confirm
      confirmState,
      confirm,
      handleConfirmYes,
      handleConfirmNo,

      // toast
      toasts,
      showToast,
      dismissToast,

      // keyboard
      keyboardOpen,
      setKeyboardVisible,

      // loading
      globalLoading,
      setGlobalLoading,
    }),
    [
      menuOpen,
      openMenu,
      closeMenu,
      toggleMenu,
      confirmState,
      confirm,
      handleConfirmYes,
      handleConfirmNo,
      toasts,
      showToast,
      dismissToast,
      keyboardOpen,
      setKeyboardVisible,
      globalLoading,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI phải dùng bên trong <UIProvider>");
  return ctx;
}