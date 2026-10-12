// src/components/LogFilter.js
// Nhiệm vụ: Bộ lọc mức log cho Rồng Thần Logs.
// Quy tắc dự án:
//   - Các mức: Tất cả / INFO / WARN / ERROR / DEBUG
//   - Chọn mức nào thì hiển thị log mức đó
//   - Tất cả hiển thị toàn bộ mức có sẵn

import React from "react";

const LEVELS = [
  { value: "all", label: "Tất cả" },
  { value: "info", label: "INFO" },
  { value: "warn", label: "WARN" },
  { value: "error", label: "ERROR" },
  { value: "debug", label: "DEBUG" },
];

export default function LogFilter({ value = "all", onChange }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontSize: "var(--font-sm)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span>Mức log:</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="glass-card no-select"
        style={{
          minHeight: 36,
          padding: "0 var(--space-3)",
          color: "var(--color-text-primary)",
          fontSize: "var(--font-sm)",
          borderRadius: "var(--radius-md)",
          appearance: "none",
          WebkitAppearance: "none",
          backgroundImage:
            "linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.6) 50%), linear-gradient(135deg, rgba(255,255,255,0.6) 50%, transparent 50%)",
          backgroundPosition:
            "calc(100% - 14px) 16px, calc(100% - 9px) 16px",
          backgroundSize: "5px 5px, 5px 5px",
          backgroundRepeat: "no-repeat",
          paddingRight: 28,
        }}
      >
        {LEVELS.map((lv) => (
          <option key={lv.value} value={lv.value} style={{ color: "#000" }}>
            {lv.label}
          </option>
        ))}
      </select>
    </label>
  );
}