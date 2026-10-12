// src/components/ActiveModelSection.js
// Nhiệm vụ: Mục "MODEL ĐANG SỬ DỤNG".
// Quy tắc dự án:
//   - Chỉ hiển thị model đang thực sự hoạt động (không giả lập)
//   - Trạng thái: loading / có model / không có model
//   - Không báo "đang hoạt động" khi chưa có xác nhận backend

import React from "react";

export default function ActiveModelSection({ activeModel, loading = false }) {
  return (
    <section style={{ marginBottom: "var(--space-5)" }}>
      <h3
        style={{
          fontSize: "var(--font-sm)",
          fontWeight: 700,
          letterSpacing: "1px",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-2)",
          textTransform: "uppercase",
        }}
      >
        MODEL ĐANG SỬ DỤNG
      </h3>

      <div
        className="glass-card"
        style={{
          padding: "var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {loading ? (
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            Đang tải…
          </div>
        ) : activeModel ? (
          <>
            <Row label="Model" value={activeModel.name || "—"} />
            <Row label="Nhà cung cấp" value={activeModel.provider || "—"} />
            <Row label="Nhiệm vụ" value={activeModel.taskType || "—"} />
            <Row
              label="Trạng thái"
              value={
                <span
                  style={{
                    color:
                      activeModel.status === "active"
                        ? "var(--color-success)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  {activeModel.status === "active" ? "🟢 Đang hoạt động" : "—"}
                </span>
              }
            />
          </>
        ) : (
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            Chưa có model nào đang hoạt động.
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: "var(--space-2)",
        fontSize: "var(--font-sm)",
      }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span
        style={{
          color: "var(--color-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}