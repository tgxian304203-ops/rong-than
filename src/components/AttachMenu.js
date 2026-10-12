// src/components/AttachMenu.js
// Nhiệm vụ: Menu nhỏ mở ra khi nhấn nút ＋ trong thanh nhập.
// Quy tắc dự án:
//   - 3 mục: 📷 Chụp ảnh / 🖼 Thêm ảnh / 📎 Thêm file
//   - Chụp ảnh mở camera thiết bị
//   - Thêm ảnh mở thư viện ảnh
//   - Thêm file mở trình chọn tệp
//   - Nhấn ra ngoài để đóng

import React, { useEffect, useRef } from "react";

export default function AttachMenu({ open, onClose, onPickFiles, onPickImages, onPickCamera }) {
  const ref = useRef(null);

  // Đóng khi nhấn ra ngoài
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose?.();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Thêm tệp đính kèm"
      className="glass-dialog"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        width: 200,
        padding: "var(--space-2)",
        zIndex: "var(--z-dialog)",
        animation: "attach-fade-in var(--duration-fast) var(--ease-out)",
      }}
    >
      <MenuItem icon="📷" label="Chụp ảnh" onClick={onPickCamera} />
      <MenuItem icon="🖼" label="Thêm ảnh" onClick={onPickImages} />
      <MenuItem icon="📎" label="Thêm file" onClick={onPickFiles} />

      <style>{`
        @keyframes attach-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function MenuItem({ icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="no-select"
      style={{
        width: "100%",
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-sm)",
        color: "var(--color-text-primary)",
        fontSize: "var(--font-base)",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span aria-hidden="true" style={{ width: 22, textAlign: "center" }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}