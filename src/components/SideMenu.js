// src/components/SideMenu.js
// Nhiệm vụ: Menu chính bên trái
// Quy tắc dự án:
//   - Trượt từ trái sang phải
//   - Phủ 100% màn hình ứng dụng
//   - Nút × ở góc trên bên phải để đóng
//   - Thứ tự: New Chat → Dự án → Lịch sử trò chuyện → Cài đặt
//   - Khu vực tài khoản ở cuối
//   - Menu nền trong suốt 0% (transparent)
//   - Các nút menu có nền kính trong suốt 10% + viền
//   - Nền KHÔNG đổi khi hover/nhấn

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUI } from "../store/uiStore.js";
import { useAuth } from "../store/authStore.js";

export default function SideMenu() {
  const navigate = useNavigate();
  const { menuOpen, closeMenu, confirm } = useUI();
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  if (!menuOpen) return null;

  const go = (path) => {
    closeMenu();
    navigate(path);
  };

  const handleLogout = async () => {
    const yes = await confirm({
      title: "Đăng xuất",
      message: "Bạn có chắc muốn đăng xuất khỏi Rồng Thần?",
      confirmText: "Đăng xuất",
      cancelText: "Hủy",
      tone: "default",
    });
    if (!yes) return;
    await logout();
    closeMenu();
  };

  return (
    <>
      {/* LỚP PHỦ 100% MÀN HÌNH — NỀN TRONG SUỐT 0% */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu chính"
        className="glass-menu"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: "var(--z-menu)",
          display: "flex",
          flexDirection: "column",
          animation: "menu-slide-in var(--duration-base) var(--ease-out)",
        }}
      >
        {/* THANH ĐÓNG × */}
        <div
          className="safe-top"
          style={{
            height: "var(--header-height)",
            display: "grid",
            gridTemplateColumns: "56px 1fr 56px",
            alignItems: "center",
            padding: "0 var(--space-2)",
          }}
        >
          <span />
          <span />
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={closeMenu}
            className="no-select"
            style={{
              width: 44,
              height: 44,
              justifySelf: "end",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-xl)",
              color: "var(--color-text-primary)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            ×
          </button>
        </div>

        {/* DANH SÁCH MỤC */}
        <nav
          className="scroll-y safe-bottom"
          style={{
            flex: 1,
            padding: "var(--space-4) var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <MenuItem label="New Chat" icon="➕" onClick={() => go("/new-chat")} />
          <MenuItem label="Dự án" icon="📁" onClick={() => go("/projects")} />
          <MenuItem
            label="Lịch sử trò chuyện"
            icon="🕘"
            onClick={() => go("/history")}
          />
          <MenuItem label="Cài đặt" icon="⚙" onClick={() => go("/settings")} />

          {/* KHU VỰC TÀI KHOẢN */}
          <div style={{ marginTop: "auto", paddingTop: "var(--space-6)" }}>
            <div
              style={{
                fontSize: "var(--font-xs)",
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "var(--space-3)",
                paddingLeft: "var(--space-3)",
                textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              }}
            >
              Khu vực tài khoản
            </div>

            {isAuthenticated ? (
              <>
                <div
                  style={{
                    padding: "0 var(--space-3) var(--space-3)",
                    color: "var(--color-text-secondary)",
                    fontSize: "var(--font-sm)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                  }}
                  title={user?.userId || ""}
                >
                  👤 {user?.userId || ""}
                </div>
                <MenuItem label="Đăng xuất" icon="↩" onClick={handleLogout} />
              </>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--space-2)",
                  padding: "0 var(--space-2)",
                }}
              >
                <button
                  type="button"
                  onClick={() => go("/login")}
                  className="no-select"
                  style={{
                    height: 44,
                    borderRadius: "var(--radius-md)",
                    color: "var(--color-text-primary)",
                    fontSize: "var(--font-sm)",
                    fontWeight: 600,
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                  }}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => go("/register")}
                  className="no-select"
                  style={{
                    height: 44,
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "rgba(34, 197, 94, 0.85)",
                    border: "1px solid rgba(34, 197, 94, 0.5)",
                    color: "#04150a",
                    fontSize: "var(--font-sm)",
                    fontWeight: 700,
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  Đăng ký
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* ANIMATION */}
      <style>{`
        @keyframes menu-slide-in {
          from { transform: translateX(-100%); opacity: 0.6; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ============================================================
// MỤC MENU — NỀN KÍNH 10% CỐ ĐỊNH (không đổi khi hover/nhấn)
// ============================================================
function MenuItem({ label, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-select"
      style={{
        width: "100%",
        minHeight: 52,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        color: "var(--color-text-primary)",
        fontSize: "var(--font-md)",
        textAlign: "left",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        textShadow: "0 1px 4px rgba(0,0,0,0.8)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: "var(--font-lg)", width: 24, textAlign: "center" }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}