// src/components/HeaderLogoCenter.js
// Nhiệm vụ: Logo 🌕🐉 nằm CHÍNH GIỮA phía trên màn hình chat chính.
// Quy tắc dự án:
//   - Chỉ dùng ở màn hình chat chính.
//   - Không dùng ở màn hình phụ (màn phụ dùng HeaderLogoRight).

import React from "react";

export default function HeaderLogoCenter() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--font-lg)",
        fontWeight: 600,
        letterSpacing: "0.5px",
        userSelect: "none",
      }}
      aria-label="Rồng Thần"
    >
      <span role="img" aria-hidden="true">
        🌕🐉
      </span>
    </div>
  );
}