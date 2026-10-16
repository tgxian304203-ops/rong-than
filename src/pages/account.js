// src/pages/account.js
// Nhiệm vụ: Cài đặt tài khoản.

import React from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { useAuth } from "../store/authStore.js";
import { IconIdCard, IconLock, IconTrash } from "../components/Icons.js";

export default function Account() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <HeaderBar variant="sub" title="Cài đặt tài khoản" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--font-xl)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-primary)",
            marginBottom: "var(--space-4)",
          }}
        >
          CÀI ĐẶT TÀI KHOẢN
        </h1>

        {isAuthenticated && user?.userId ? (
          <div
            style={{
              textAlign: "center",
              fontSize: "var(--font-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-5)",
            }}
          >
            Đang đăng nhập: <strong>{user.userId}</strong>
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              fontSize: "var(--font-sm)",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-5)",
            }}
          >
            Bạn chưa đăng nhập.
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <BigButton
            icon={<IconIdCard size={24} />}
            label="Đổi ID tài khoản"
            onClick={() => navigate("/account/change-id")}
          />
          <BigButton
            icon={<IconLock size={24} />}
            label="Đổi mật khẩu"
            onClick={() => navigate("/account/change-password")}
          />
          <BigButton
            icon={<IconTrash size={24} />}
            label="Xóa tài khoản"
            tone="danger"
            onClick={() => navigate("/account/delete")}
          />
        </div>
      </div>
    </div>
  );
}

function BigButton({ icon, label, onClick, tone = "default" }) {
  const isDanger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card no-select"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        color: isDanger ? "var(--color-error)" : "var(--color-text-primary)",
        fontSize: "var(--font-md)",
        fontWeight: 600,
        borderRadius: "var(--radius-md)",
        textAlign: "left",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
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