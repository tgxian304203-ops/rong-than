// src/pages/settings.js
// Nhiệm vụ: Màn hình Cài đặt.

import React from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { IconKey, IconUser } from "../components/Icons.js";

export default function Settings() {
  const navigate = useNavigate();

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
      <HeaderBar variant="sub" title="Cài đặt" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--font-xl)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-primary)",
            marginBottom: "var(--space-6)",
          }}
        >
          CÀI ĐẶT
        </h1>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <BigButton
            icon={<IconKey size={24} />}
            label="Dán Key"
            onClick={() => navigate("/paste-key")}
          />
          <BigButton
            icon={<IconUser size={24} />}
            label="Cài đặt tài khoản"
            onClick={() => navigate("/account")}
          />
        </div>
      </div>
    </div>
  );
}

function BigButton({ icon, label, onClick }) {
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
        color: "var(--color-text-primary)",
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