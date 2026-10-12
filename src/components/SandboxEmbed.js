// src/components/SandboxEmbed.js
// Nhiệm vụ: Nhúng LiveCodes để chạy kiểm thử code.
// Quy tắc dự án:
//   - BOSS kiểm tra chạy thử trên Sandbox
//   - Chỉ trả về User khi đúng (PASS)
//   - Sai → quay lại sửa cho tới khi đúng
//
// LƯU Ý: Component này chỉ hiển thị kết quả Sandbox đã có từ backend.
// Việc chạy thực tế do backend điều khiển qua api/sandbox.js.

import React from "react";

const STATUS_INFO = {
  idle: { icon: "⚪", label: "Chưa chạy", color: "var(--color-text-muted)" },
  running: { icon: "🟡", label: "Đang chạy", color: "var(--color-warning)" },
  passed: { icon: "🟢", label: "Đạt", color: "var(--color-success)" },
  failed: { icon: "🔴", label: "Không đạt", color: "var(--color-error)" },
  error: { icon: "⚠", label: "Lỗi", color: "var(--color-error)" },
};

export default function SandboxEmbed({ run }) {
  const status = run?.status || "idle";
  const info = STATUS_INFO[status] || STATUS_INFO.idle;

  return (
    <section
      className="glass-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "var(--font-sm)",
        }}
      >
        <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>
          SANDBOX
        </span>
        <span style={{ color: info.color }}>
          {info.icon} {info.label}
        </span>
      </div>

      {run?.language ? (
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          Ngôn ngữ: {run.language}
        </div>
      ) : null}

      {run?.stdout ? (
        <pre
          style={{
            margin: 0,
            padding: "var(--space-2)",
            backgroundColor: "rgba(0,0,0,0.35)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-xs)",
            color: "var(--color-text-primary)",
            maxHeight: 220,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {run.stdout}
        </pre>
      ) : null}

      {run?.stderr ? (
        <pre
          style={{
            margin: 0,
            padding: "var(--space-2)",
            backgroundColor: "rgba(120,0,0,0.25)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-xs)",
            color: "var(--color-error)",
            maxHeight: 220,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {run.stderr}
        </pre>
      ) : null}

      {!run ? (
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          Chưa có lượt chạy nào.
        </div>
      ) : null}
    </section>
  );
}