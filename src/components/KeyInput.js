// src/components/KeyInput.js
// Nhiệm vụ: Ô nhập API Key + nút 👁 hiện/ẩn + nút ▶ Run.
// Quy tắc dự án:
//   - Nút ▶ Run nằm NGAY CẠNH ô nhập (không tách rời)
//   - 👁 để hiện/ẩn nội dung key
//   - Run kiểm tra key với backend, KHÔNG tự báo thành công
//   - Khi đang kiểm tra: khóa nút, hiện trạng thái
//   - Sau khi backend xác nhận mới báo thành công và xóa ô nhập

import React, { useState } from "react";

export default function KeyInput({ onRun, running = false, disabled = false, placeholder = "Nhập API Key..." }) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleRun = async () => {
    setLocalError("");
    const trimmed = value.trim();
    if (!trimmed) {
      setLocalError("Chưa nhập API Key");
      return;
    }
    const result = await onRun?.(trimmed);
    if (result?.ok) {
      setValue("");
      setVisible(false);
    } else if (result?.error) {
      setLocalError(result.error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        className="glass-inputbar"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 44px 48px",
          alignItems: "center",
          padding: "0 var(--space-1) 0 var(--space-3)",
          minHeight: 48,
        }}
      >
        {/* Ô NHẬP */}
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || running}
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            height: 46,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--color-text-primary)",
            fontSize: "var(--font-base)",
          }}
        />

        {/* 👁 HIỆN / ẨN */}
        <button
          type="button"
          aria-label={visible ? "Ẩn key" : "Hiện key"}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled || running}
          className="no-select"
          style={{
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--font-lg)",
            color: "var(--color-text-secondary)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {visible ? "🙈" : "👁"}
        </button>

        {/* ▶ RUN */}
        <button
          type="button"
          aria-label="Kiểm tra và thêm key"
          onClick={handleRun}
          disabled={disabled || running}
          className="no-select"
          style={{
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--font-lg)",
            color: running ? "var(--color-text-muted)" : "var(--color-ai-text)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {running ? "…" : "▶"}
        </button>
      </div>

      {localError ? (
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--color-error)",
            paddingLeft: "var(--space-2)",
          }}
        >
          {localError}
        </div>
      ) : null}
    </div>
  );
}