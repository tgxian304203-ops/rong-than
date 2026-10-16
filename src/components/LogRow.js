// src/components/LogRow.js
// Nhiệm vụ: Một dòng log trong danh sách Rồng Thần Logs.

import React from "react";
import { formatTime } from "../utils/format.js";

const LEVEL_COLOR = {
  info: "var(--color-info)",
  warn: "var(--color-warning)",
  error: "var(--color-error)",
  debug: "var(--color-text-muted)",
};

export default function LogRow({ log }) {
  const level = (log?.level || "info").toLowerCase();
  const color = LEVEL_COLOR[level] || "var(--color-text-secondary)";
  const time = formatTime(log?.timestamp);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "72px 64px 1fr",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
        borderBottom: "1px solid var(--color-border)",
        fontSize: "var(--font-xs)",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>{time}</span>
      <span style={{ color, fontWeight: 700, textTransform: "uppercase" }}>
        {level}
      </span>
      <span
        style={{
          color: "var(--color-text-primary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {log?.message || ""}
      </span>
    </div>
  );
}