// src/components/SandboxEmbed.js
// Nhiệm vụ: Nhúng LiveCodes ONLINE để chạy thử code.
// LiveCodes chạy hoàn toàn trong trình duyệt — không cần backend, không cần API key.

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
// ENCODE BASE64
// ============================================================

function b64(str) {
  try {
    return btoa(unescape(encodeURIComponent(String(str || ""))));
  } catch {
    return "";
  }
}

// ============================================================
// SANDBOX EMBED
// ============================================================

export default function SandboxEmbed({
  code,
  language = "javascript",
  title = "Sandbox",
}) {
  const [open, setOpen] = useState(false);

  const embedUrl = useMemo(() => {
    if (!code || typeof code !== "string") return null;

    const param = normalizeLang(language) || "js";
    const encoded = b64(code);
    if (!encoded) return null;

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
        gap: "var(--space-2)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          flexWrap: "wrap",
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
        <div style={{ display: "flex", gap: 6 }}>
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
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="no-select"
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-xs)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ↗ Mở
          </a>
        </div>
      </div>

      {/* Info */}
      <div
        style={{
          fontSize: "var(--font-xs)",
          color: "var(--color-text-muted)",
        }}
      >
        Ngôn ngữ:{" "}
        <strong style={{ color: "var(--color-text-secondary)" }}>
          {language}
        </strong>
        {" · "}Chạy bằng LiveCodes (client-side)
      </div>

      {/* Iframe */}
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
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
          />
        </div>
      ) : null}

      {/* Ghi chú */}
      <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
        Nếu khung không hiển thị, bấm nút{" "}
        <strong style={{ color: "var(--color-text-secondary)" }}>↗ Mở</strong>{" "}
        để chạy trong tab mới.
      </div>
    </section>
  );
}