// src/components/MessageBubble.js
// Nhiệm vụ: Khung tin nhắn AI hoặc User.
// - Tách code block ``` để hiển thị riêng
// - Code block có nút Copy + Sandbox LiveCodes (chỉ AI)
// - Ảnh có thể bấm vào để xem full-size

import React, { useState } from "react";
import { formatTime, getFileIcon, formatFileSize } from "../utils/format.js";
import { isImageFile } from "../utils/validate.js";
import SandboxEmbed from "./SandboxEmbed.js";

export default function MessageBubble({ message }) {
  const isAI = message.role === "ai";
  const isUser = message.role === "user";

  const label = isAI ? "🔥🐉 Rồng Thần" : "👾 User";
  const time = formatTime(message.createdAt);

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];

  const [lightboxSrc, setLightboxSrc] = useState(null);

  const parts = splitTextAndCode(message.text || "");

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
            maxWidth: "92%",
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
          {parts.map((part, idx) => {
            if (part.type === "code") {
              return (
                <div key={idx}>
                  <CodeBlock
                    language={part.language}
                    code={part.content}
                  />
                  {isAI ? (
                    <SandboxEmbed
                      code={part.content}
                      language={part.language || "javascript"}
                      title="Sandbox"
                    />
                  ) : null}
                </div>
              );
            }
            if (part.type === "text") {
              if (!part.content.trim()) return null;
              return (
                <div
                  key={idx}
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {part.content}
                </div>
              );
            }
            return null;
          })}

          {/* TRẠNG THÁI */}
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

      {/* LIGHTBOX ẢNH */}
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
// TÁCH TEXT VÀ CODE BLOCK
// ============================================================

function splitTextAndCode(text) {
  if (typeof text !== "string" || !text) return [];

  const parts = [];
  const re = /```([a-zA-Z0-9+\-#.]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textPart = text.slice(lastIndex, match.index);
      if (textPart.trim()) {
        parts.push({ type: "text", content: textPart });
      }
    }

    const language = (match[1] || "").trim();
    const code = match[2] || "";
    parts.push({ type: "code", language, content: code });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const textPart = text.slice(lastIndex);
    if (textPart.trim()) {
      parts.push({ type: "text", content: textPart });
    }
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content: text });
  }

  return parts;
}

// ============================================================
// CODE BLOCK
// ============================================================

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        marginTop: "var(--space-2)",
        marginBottom: "var(--space-2)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.15)",
        backgroundColor: "rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 8px",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          fontSize: 11,
        }}
      >
        <span
          style={{
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
          }}
        >
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="no-select"
          style={{
            color: copied
              ? "var(--color-success)"
              : "var(--color-text-secondary)",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            backgroundColor: "rgba(255,255,255,0.08)",
          }}
        >
          {copied ? "✓ Đã copy" : "Copy"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "var(--space-3)",
          overflowX: "auto",
          fontSize: 12,
          lineHeight: 1.5,
          color: "#e6e6e6",
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          whiteSpace: "pre",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ============================================================
// ATTACHMENT PREVIEW
// ============================================================
function AttachmentPreview({ attachment, isAI, onOpenImage }) {
  const url = attachment.url || null;
  const dataUrl = attachment.dataUrl || null;
  const name = attachment.name || "tệp";
  const size =
    typeof attachment.size === "number" ? formatFileSize(attachment.size) : "";

  const type = attachment.type || "";
  const isImage = type ? isImageFile({ type, name }) : isImageFile({ name });

  const src = url || dataUrl || null;

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