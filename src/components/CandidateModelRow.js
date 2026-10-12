// src/components/CandidateModelRow.js
// Nhiệm vụ: Một dòng model ứng viên.
// Quy tắc dự án:
//   - Hiển thị tên model + nhà cung cấp
//   - Trạng thái khả dụng (khả dụng / hết quota / lỗi)
//   - Cho phép chọn làm model đang sử dụng (nếu khả dụng)
//   - Không tự báo thành công khi chưa có xác nhận backend

import React from "react";

export default function CandidateModelRow({ model, onSelect, selecting = false }) {
  const status = model?.status || "available"; // "available" | "no-quota" | "error" | "unknown"
  const isDisabled = status !== "available" || selecting;

  const statusInfo = (() => {
    switch (status) {
      case "available":
        return { icon: "🔥", label: "Khả dụng", color: "var(--color-quota-ok)" };
      case "no-quota":
        return { icon: "😓", label: "Hết quota", color: "var(--color-quota-out)" };
      case "error":
        return { icon: "⚠", label: "Lỗi", color: "var(--color-error)" };
      default:
        return { icon: "•", label: "Không rõ", color: "var(--color-text-muted)" };
    }
  })();

  return (
    <div
      className="glass-card"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={model?.name || ""}
        >
          {model?.name || "—"}
        </div>
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          {model?.provider || "—"}
          {model?.taskType ? ` · ${model.taskType}` : ""}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span
          aria-label={statusInfo.label}
          title={statusInfo.label}
          style={{
            fontSize: "var(--font-md)",
            color: statusInfo.color,
          }}
        >
          {statusInfo.icon}
        </span>

        {typeof onSelect === "function" ? (
          <button
            type="button"
            onClick={() => onSelect?.(model)}
            disabled={isDisabled}
            className="no-select"
            style={{
              minHeight: 36,
              padding: "0 var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: isDisabled
                ? "var(--color-text-muted)"
                : "var(--color-text-primary)",
              fontSize: "var(--font-xs)",
              fontWeight: 600,
            }}
          >
            {selecting ? "…" : "Chọn"}
          </button>
        ) : null}
      </div>
    </div>
  );
}