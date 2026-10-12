// src/pages/paste-key.js
// Nhiệm vụ: Trang chọn loại key.
// Quy tắc dự án (PHẦN 04, mục 10):
//   - CHỈ CÓ 3 nút: 🧠 Đại Não, 🧠 Tiểu Não, 🌐 Web
//   - Điều hướng tới trang quản lý key tương ứng

import React from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";

export default function PasteKey() {
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
      <HeaderBar variant="sub" title="Dán Key" />

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
          DÁN KEY
        </h1>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <BigButton
            icon="🧠"
            label="Đại Não"
            onClick={() => navigate("/paste-key/dai-nao")}
          />
          <BigButton
            icon="🧠"
            label="Tiểu Não"
            onClick={() => navigate("/paste-key/tieu-nao")}
          />
          <BigButton
            icon="🌐"
            label="Web"
            onClick={() => navigate("/paste-key/web")}
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
      <span aria-hidden="true" style={{ fontSize: "var(--font-xl)", width: 28 }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}