// src/components/MessageBubble.js
// Nhiệm vụ: Khung tin nhắn AI hoặc User.
// Quy tắc dự án:
//   - AI: nhãn 🔥🐉 Rồng Thần, căn trái, chữ xanh lá, nền trong suốt ~50%
//   - User: nhãn 👾 User, căn phải, chữ trắng, nền trong suốt ~50%
//   - Nội dung dài tự xuống dòng
//   - Hiển thị tệp đính kèm: ảnh hiện hình, tệp hiện tên
//   - Ảnh có thể bấm vào để xem full-size

import React, { useState, useEffect } from "react";
import { formatTime, getFileIcon, formatFileSize } from "../utils/format.js";
import { isImageFile } from "../utils/validate.js";

export default function MessageBubble({ message }) {
  const isAI = message.role === "ai";
  const isUser = message.role === "user";

  const label = isAI ? "🔥🐉 Rồng Thần" : "👾 User";
  const time = formatTime(message.createdAt);

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];

  const [lightboxSrc, setLightboxSrc] = useState(null);

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
          marginBottom: "var(--space-4)",
          padding: "0 var(--space-3)",
          maxWidth: "100%",
        }}
      >
        {/* NHÃN */}
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: isAI ? "var(--color-ai-text)" : "var(--color-text-secondary)",
            marginBottom: 4,
            paddingLeft: isUser ? 0 : 4,
            paddingRight: isUser ? 4 : 0,
            userSelect: "none",
          }}
        >
          {label}
          {time ? (
            <span
              style={{
                marginLeft: 6,
                color: "var(--color-text-muted)",
                fontSize: 10,
              }}
            >
              {time}
            </span>
          ) : null}
        </div>

        {/* KHUNG TIN NHẮN */}
        <div
          className={`glass-bubble ${
            isAI ? "glass-bubble-ai" : "glass-bubble-user"
          }`}
          style={{
            maxWidth: "88%",
            minWidth: 40,
            position: "relative",
          }}
        >
          {/* TỆP ĐÍNH KÈM */}
          {attachments.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                marginBottom: message.text ? "var(--space-2)" : 0,
              }}
            >
              {attachments.map((att, idx) => (
                <AttachmentPreview
                  key={att.id || `${idx}-${att.name || "att"}`}
                  attachment={att}
                  isAI={isAI}
                  onOpenImage={(src) => setLightboxSrc(src)}
                />
              ))}
            </div>
          ) : null}

          {/* NỘI DUNG */}
          {message.text ? <div>{message.text}</div> : null}

          {/* TRẠNG THÁI GỬI */}
          {message.pending ? (
            <div
              style={{
                fontSize: 10,
                marginTop: 4,
                color: "var(--color-text-muted)",
              }}
            >
              đang gửi…
            </div>
          ) : null}
          {message.failed ? (
            <div
              style={{
                fontSize: 10,
                marginTop: 4,
                color: "var(--color-error)",
              }}
            >
              gửi thất bại
            </div>
          ) : null}
        </div>
      </div>

      {/* LIGHTBOX XEM ẢNH FULL-SIZE */}
      {lightboxSrc ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh"
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            backgroundColor: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
          }}
        >
          <button
            type="button"
            aria-label="Đóng"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxSrc(null);
            }}
            className="no-select"
            style={{
              position: "absolute",
              top: "calc(env(safe-area-inset-top, 0) + 12px)",
              right: 12,
              width: 44,
              height: 44,
              borderRadius: "var(--radius-full)",
              backgroundColor: "rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: "var(--font-xl)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
          <img
            src={lightboxSrc}
            alt="Ảnh"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: "var(--radius-md)",
            }}
          />
        </div>
      ) : null}
    </>
  );
}

// ============================================================
// XEM TRƯỚC TỆP ĐÍNH KÈM TRONG TIN NHẮN
// ============================================================
function AttachmentPreview({ attachment, isAI, onOpenImage }) {
  const url = attachment.url || null;
  const dataUrl = attachment.dataUrl || null;
  const name = attachment.name || "tệp";
  const size =
    typeof attachment.size === "number" ? formatFileSize(attachment.size) : "";

  const type = attachment.type || "";
  const isImage = type
    ? isImageFile({ type, name })
    : isImageFile({ name });

  // Ưu tiên url, fallback dataUrl
  const src = url || dataUrl || null;

  // Ảnh có src → hiển thị hình, bấm để xem full
  if (isImage && src) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenImage?.(src)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenImage?.(src);
          }
        }}
        className="no-select"
        style={{
          width: 160,
          height: 160,
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          border: "1px solid var(--color-border)",
          cursor: "pointer",
          backgroundColor: "rgba(0,0,0,0.3)",
        }}
      >
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  // Ảnh không có src → hiển thị chip tên file
  // Tệp thường → hiển thị chip tên file
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2)",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "rgba(255,255,255,0.05)",
        border: "1px solid var(--color-border)",
        fontSize: "var(--font-xs)",
        maxWidth: 220,
      }}
      title={name}
    >
      <span aria-hidden="true" style={{ fontSize: 18 }}>
        {getFileIcon(name)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isAI ? "var(--color-ai-text)" : "var(--color-text-primary)",
          }}
        >
          {name}
        </div>
        {size ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
            {size}
          </div>
        ) : null}
      </div>
    </div>
  );
}