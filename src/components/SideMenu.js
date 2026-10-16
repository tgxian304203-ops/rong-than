// src/components/SideMenu.js
// Nhiệm vụ: Menu chính bên trái.
// Đã thay emoji bằng SVG (trừ các emoji được giữ).

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUI } from "../store/uiStore.js";
import { useAuth } from "../store/authStore.js";
import {
  IconMessagePlus,
  IconFolder,
  IconHistory,
  IconSettings,
  IconLogout,
  IconLogin,
  IconUserPlus,
  IconClose,
} from "./Icons.js";

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
              color: "var(--color-text-primary)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <IconClose size={22} />
          </button>
        </div>

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
          <MenuItem
            label="New Chat"
            icon={<IconMessagePlus size={20} />}
            onClick={() => go("/new-chat")}
          />
          <MenuItem
            label="Dự án"
            icon={<IconFolder size={20} />}
            onClick={() => go("/projects")}
          />
          <MenuItem
            label="Lịch sử trò chuyện"
            icon={<IconHistory size={20} />}
            onClick={() => go("/history")}
          />
          <MenuItem
            label="Cài đặt"
            icon={<IconSettings size={20} />}
            onClick={() => go("/settings")}
          />

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
                  {user?.userId || ""}
                </div>
                <MenuItem
                  label="Đăng xuất"
                  icon={<IconLogout size={20} />}
                  onClick={handleLogout}
                />
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
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <IconLogin size={18} />
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
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <IconUserPlus size={18} />
                  Đăng ký
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      <style>{`
        @keyframes menu-slide-in {
          from { transform: translateX(-100%); opacity: 0.6; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}

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
        style={{
          width: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}