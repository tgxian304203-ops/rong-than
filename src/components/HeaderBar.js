// src/components/HeaderBar.js
// Nhiệm vụ: Thanh trên cùng cho mọi màn hình.
// Đã thay emoji bằng SVG.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useUI } from "../store/uiStore.js";
import HeaderLogoCenter from "./HeaderLogoCenter.js";
import HeaderLogoRight from "./HeaderLogoRight.js";
import { IconMenu, IconArrowLeft, IconMoreVertical } from "./Icons.js";

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
      className="safe-top glass-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: "var(--z-header)",
        height: "var(--header-height)",
        display: "grid",
        gridTemplateColumns: "56px 1fr 56px",
        alignItems: "center",
        padding: "0 var(--space-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {variant === "main" ? (
          <IconButton label="Mở menu" onClick={openMenu}>
            <IconMenu size={22} />
          </IconButton>
        ) : showBack ? (
          <IconButton label="Quay lại" onClick={handleBack}>
            <IconArrowLeft size={22} />
          </IconButton>
        ) : null}
      </div>

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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {variant === "main" ? (
          <IconButton
            label="Rồng Thần Logs"
            onClick={() => navigate("/logs")}
          >
            <IconMoreVertical size={22} />
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
        color: "var(--color-text-primary)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {children}
    </button>
  );
}