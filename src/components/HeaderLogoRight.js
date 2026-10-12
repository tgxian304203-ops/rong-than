// src/components/HeaderLogoRight.js
// Nhiệm vụ: Logo 🌕🐉 nằm ở GÓC TRÊN BÊN PHẢI trên các màn hình phụ.
// Quy tắc dự án:
//   - Không tự chuyển về giữa.
//   - Không đặt logo lên từng nút chức năng.

import React from "react";

export default function HeaderLogoRight() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--font-md)",
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