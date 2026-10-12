// src/components/EmptyState.js
// Nhiệm vụ: Trạng thái trống dùng chung.
// Được MessageList import để hiển thị khi chưa có tin nhắn.

import React from "react";

export default function EmptyState({ icon = "🌕🐉", title = "", subtitle = "", action = null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6) var(--space-4)",
        textAlign: "center",
        minHeight: 200,
        gap: "var(--space-3)",
      }}
    >
      {icon ? (
        <div
          aria-hidden="true"
          style={{
            fontSize: 48,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {icon}
        </div>
      ) : null}

      {title ? (
        <div
          style={{
            fontSize: "var(--font-md)",
            color: "var(--color-text-primary)",
            fontWeight: 600,
            maxWidth: 360,
          }}
        >
          {title}
        </div>
      ) : null}

      {subtitle ? (
        <div
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
            maxWidth: 360,
          }}
        >
          {subtitle}
        </div>
      ) : null}

      {action ? <div style={{ marginTop: "var(--space-2)" }}>{action}</div> : null}
    </div>
  );
}