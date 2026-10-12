// src/components/SandboxEmbed.js
// Nhiệm vụ: Nhúng LiveCodes ONLINE để chạy thử code.
// LiveCodes chạy hoàn toàn trong trình duyệt — không cần backend, không cần API key.
// Trang chính: https://livecodes.io

import React, { useMemo, useState } from "react";

// ============================================================
// MAP NGÔN NGỮ → PARAM LIVECODES
// ============================================================

const LANG_TO_PARAM = {
  html: "html",
  css: "css",
  javascript: "js",
  js: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  python: "py",
  py: "py",
  markdown: "md",
  md: "md",
};

function normalizeLang(lang) {
  const l = String(lang || "").toLowerCase().trim();
  return LANG_TO_PARAM[l] || null;
}

// ============================================================
// ENCODE BASE64 — LiveCodes hiểu tham số base64
// ============================================================

function b64(str) {
  try {
    // Trình duyệt: dùng btoa với UTF-8 an toàn
    return btoa(unescape(encodeURIComponent(String(str || ""))));
  } catch {
    return "";
  }
}

// ============================================================
// SANDBOX EMBED
// ============================================================

/**
 * @param {object} props
 * @param {string} props.code       — mã nguồn
 * @param {string} [props.language] — ngôn ngữ (html|js|python|...)
 * @param {string} [props.title]    — tiêu đề (mặc định "Sandbox")
 */
export default function SandboxEmbed({ code, language = "javascript", title = "Sandbox" }) {
  const [open, setOpen] = useState(false);

  const embedUrl = useMemo(() => {
    if (!code || typeof code !== "string") return null;

    const param = normalizeLang(language) || "js";
    const encoded = b64(code);
    if (!encoded) return null;

    // Build URL LiveCodes online
    // https://livecodes.io/?<param>=<base64>
    // Ví dụ: ?html=<b64> hoặc ?js=<b64>
    const params = new URLSearchParams();
    params.set(param, encoded);

    return `https://livecodes.io/?${params.toString()}`;
  }, [code, language]);

  if (!embedUrl) {
    return (
      <div
        className="glass-card"
        style={{
          padding: "var(--space-3)",
          fontSize: "var(--font-sm)",
          color: "var(--color-text-muted)",
        }}
      >
        Không có code để chạy.
      </div>
    );
  }

  return (
    <section
      className="glass-card"
      style={{
        marginTop: "var(--space-2)",
        marginBottom: "var(--space-2)",
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          🧪 {title}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="no-select"
          style={{
            padding: "6px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-strong)",
            color: "var(--color-ai-text)",
            fontSize: "var(--font-xs)",
            fontWeight: 600,
          }}
        >
          {open ? "Ẩn" : "Chạy thử"}
        </button>
      </div>

      {/* Thông tin ngôn ngữ */}
      <div
        style={{
          fontSize: "var(--font-xs)",
          color: "var(--color-text-muted)",
        }}
      >
        Ngôn ngữ: <strong style={{ color: "var(--color-text-secondary)" }}>{language}</strong>
        {" · "}Chạy bằng LiveCodes (client-side)
      </div>

      {/* Iframe LiveCodes */}
      {open ? (
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 10",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
            backgroundColor: "#1e1e1e",
          }}
        >
          <iframe
            src={embedUrl}
            title={title}
            allow="clipboard-read; clipboard-write; fullscreen"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
          />
        </div>
      ) : null}

      {/* Fallback: mở tab mới nếu iframe không load được */}
      <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
        Nếu khung không hiển thị,{" "}
        <a
          href={embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-ai-text)", textDecoration: "underline" }}
        >
          mở LiveCodes trong tab mới
        </a>
        .
      </div>
    </section>
  );
}