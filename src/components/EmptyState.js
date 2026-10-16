// src/components/EmptyState.js
// Nhiệm vụ: Trạng thái trống dùng chung.
// Hỗ trợ cả emoji (string) và SVG (React node).

import React from "react";
import {
  IconHistory,
  IconInbox,
  IconLoader,
  IconWarning,
  IconFolder,
  IconMessage,
  IconCheckCircle,
} from "./Icons.js";

// Map tên icon string → component SVG
const ICON_MAP = {
  history: IconHistory,
  inbox: IconInbox,
  loader: IconLoader,
  warning: IconWarning,
  folder: IconFolder,
  message: IconMessage,
  check: IconCheckCircle,
};

export default function EmptyState({
  icon = "🌕🐉",
  title = "",
  subtitle = "",
  action = null,
}) {
  let renderedIcon = null;

  // Nếu icon là string và có trong map → dùng SVG
  if (typeof icon === "string" && ICON_MAP[icon]) {
    const IconComp = ICON_MAP[icon];
    renderedIcon = <IconComp size={48} />;
  } else if (typeof icon === "string") {
    // String thường (emoji) → render text
    renderedIcon = <span style={{ fontSize: 48, lineHeight: 1 }}>{icon}</span>;
  } else {
    // React node (đã là SVG) → dùng trực tiếp
    renderedIcon = icon;
  }

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
      {renderedIcon ? (
        <div
          aria-hidden="true"
          style={{
            color: "var(--color-text-muted)",
            userSelect: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {renderedIcon}
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

      {action ? (
        <div style={{ marginTop: "var(--space-2)" }}>{action}</div>
      ) : null}
    </div>
  );
}