// src/components/HeaderBar.js
// Nhiệm vụ: Thanh trên cùng cho mọi màn hình.
// KHÔNG có nền/viền — chỉ có nút và logo nổi.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useUI } from "../store/uiStore.js";
import HeaderLogoCenter from "./HeaderLogoCenter.js";
import HeaderLogoRight from "./HeaderLogoRight.js";

export default function HeaderBar({
  variant = "sub",
  title = "",
  showBack = true,
  onBack = null,
  rightSlot = null,
}) {
  const navigate = useNavigate();
  const { openMenu } = useUI();

  const handleBack = () => {
    if (typeof onBack === "function") onBack();
    else navigate(-1);
  };

  return (
    <header
      className="safe-top"
      style={{
        position: "sticky",
        top: 0,
        zIndex: "var(--z-header)",
        height: "var(--header-height)",
        display: "grid",
        gridTemplateColumns: "56px 1fr 56px",
        alignItems: "center",
        padding: "0 var(--space-2)",
        // KHÔNG có backgroundColor, backdropFilter, borderBottom
        backgroundColor: "transparent",
        borderBottom: "none",
      }}
    >
      {/* Ô TRÁI */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {variant === "main" ? (
          <IconButton label="Mở menu" onClick={openMenu}>
            ☰
          </IconButton>
        ) : showBack ? (
          <IconButton label="Quay lại" onClick={handleBack}>
            ←
          </IconButton>
        ) : null}
      </div>

      {/* Ô GIỮA */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {variant === "main" ? (
          <HeaderLogoCenter />
        ) : title ? (
          <div
            style={{
              fontSize: "var(--font-md)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
            title={title}
          >
            {title}
          </div>
        ) : null}
      </div>

      {/* Ô PHẢI */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {variant === "main" ? (
          <IconButton label="Rồng Thần Logs" onClick={() => navigate("/logs")}>
            ⋮
          </IconButton>
        ) : rightSlot ? (
          rightSlot
        ) : (
          <HeaderLogoRight />
        )}
      </div>
    </header>
  );
}

// ============================================================
// Nút icon
// ============================================================
function IconButton({ children, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="no-select"
      style={{
        width: 44,
        height: 44,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--font-xl)",
        color: "var(--color-text-primary)",
        borderRadius: "var(--radius-md)",
        transition: "background-color var(--duration-fast) var(--ease-out)",
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {children}
    </button>
  );
}