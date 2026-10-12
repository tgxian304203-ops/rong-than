// src/components/ConfirmDialog.js
// Nhiệm vụ: Hộp xác nhận dùng chung.
// Đọc trạng thái từ useUI().confirmState.
// Quy tắc:
//   - Hiển thị tiêu đề, nội dung, nút Hủy / Xác nhận
//   - tone="danger" → nút Xác nhận màu đỏ
//   - Nhấn Hủy → resolve(false)
//   - Nhấn Xác nhận → resolve(true)

import React from "react";
import { useUI } from "../store/uiStore.js";

export default function ConfirmDialog() {
  const { confirmState, handleConfirmYes, handleConfirmNo } = useUI();
  const { open, title, message, confirmText, cancelText, tone } = confirmState;

  if (!open) return null;

  const isDanger = tone === "danger";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || "Xác nhận"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-dialog)",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        animation: "confirm-fade-in var(--duration-fast) var(--ease-out)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleConfirmNo();
      }}
    >
      <div
        className="glass-dialog"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {title ? (
          <div
            style={{
              fontSize: "var(--font-lg)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {title}
          </div>
        ) : null}

        {message ? (
          <div
            style={{
              fontSize: "var(--font-base)",
              color: "var(--color-text-secondary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {message}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2)",
            marginTop: "var(--space-2)",
          }}
        >
          <button
            type="button"
            onClick={handleConfirmNo}
            className="no-select"
            style={{
              minHeight: 44,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-base)",
              fontWeight: 600,
            }}
          >
            {cancelText || "Hủy"}
          </button>
          <button
            type="button"
            onClick={handleConfirmYes}
            className="no-select"
            style={{
              minHeight: 44,
              borderRadius: "var(--radius-md)",
              backgroundColor: isDanger
                ? "var(--color-error)"
                : "var(--color-success)",
              color: isDanger ? "#fff" : "#04150a",
              fontSize: "var(--font-base)",
              fontWeight: 700,
            }}
          >
            {confirmText || "Xác nhận"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confirm-fade-in {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}