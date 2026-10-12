// src/components/AttachmentChip.js
// Nhiệm vụ: Chip hiển thị tệp đính kèm trong vùng nhập.
// Quy tắc dự án:
//   - Ảnh: hiển thị hình thu nhỏ
//   - Tệp thường: hiển thị tên tệp
//   - Mỗi chip có nút × ở góc trên bên phải
//   - Nhấn × chỉ xóa tệp tương ứng, không xóa các tệp khác
//   - Nhiều chip tự xuống hàng khi không đủ rộng

import React, { useEffect, useState } from "react";
import { getFileIcon, formatFileSize } from "../utils/format.js";
import { isImageFile } from "../utils/validate.js";

export default function AttachmentChip({ file, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const isImage = isImageFile(file);

  // Tạo URL xem trước cho ảnh
  useEffect(() => {
    if (!isImage || !file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, isImage]);

  const name = file?.name || "tệp";
  const size = typeof file?.size === "number" ? formatFileSize(file.size) : "";

  return (
    <div
      className="glass-card"
      style={{
        position: "relative",
        width: 120,
        minHeight: 72,
        padding: "var(--space-2)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        overflow: "hidden",
      }}
      title={name}
    >
      {/* Nút × */}
      <button
        type="button"
        aria-label={`Xóa ${name}`}
        onClick={() => onRemove?.(file)}
        className="no-select"
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 22,
          height: 22,
          borderRadius: "var(--radius-full)",
          backgroundColor: "rgba(0,0,0,0.65)",
          color: "var(--color-text-primary)",
          fontSize: "var(--font-sm)",
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        ×
      </button>

      {/* Hình xem trước hoặc icon */}
      <div
        style={{
          width: "100%",
          height: 44,
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.05)",
          fontSize: 22,
        }}
      >
        {isImage && previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span aria-hidden="true">{getFileIcon(name)}</span>
        )}
      </div>

      {/* Tên tệp + kích thước */}
      <div
        style={{
          fontSize: "var(--font-xs)",
          color: "var(--color-text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
      {size ? (
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
          }}
        >
          {size}
        </div>
      ) : null}
    </div>
  );
}