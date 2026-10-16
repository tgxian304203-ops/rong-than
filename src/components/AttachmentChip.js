// src/components/AttachmentChip.js
// Nhiệm vụ: Chip hiển thị tệp đính kèm trong vùng nhập.

import React, { useEffect, useState } from "react";
import { getFileIcon, formatFileSize } from "../utils/format.js";
import { isImageFile } from "../utils/validate.js";
import { FileTypeIcon, IconClose } from "./Icons.js";

export default function AttachmentChip({ file, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const isImage = isImageFile(file);

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
  const iconType = getFileIcon(name);

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
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <IconClose size={14} />
      </button>

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
          color: "var(--color-text-secondary)",
        }}
      >
        {isImage && previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <FileTypeIcon type={iconType} size={22} />
        )}
      </div>

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