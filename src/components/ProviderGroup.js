// src/components/ProviderGroup.js
// Nhiệm vụ: Nhóm nhà cung cấp (Groq / Gemini / OpenRouter / Tavily / SerpJet / Brave).
// Quy tắc dự án:
//   - Tiêu đề nhóm in hoa: GROQ, GEMINI, OPENROUTER, TAVILY, SERPJET, BRAVE SEARCH
//   - Mỗi nhóm có vùng cuộn dọc RIÊNG, độc lập
//   - Cuộn nhóm này KHÔNG làm nhóm khác cuộn theo
//   - Số lượng key phản ánh số key thật

import React from "react";
import KeyRow from "./KeyRow.js";

export default function ProviderGroup({
  label,
  items,
  onDeleteKey,
  emptyHint = "Chưa có key nào",
  maxHeight = 180,
}) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section style={{ marginBottom: "var(--space-4)" }}>
      <h3
        style={{
          fontSize: "var(--font-sm)",
          fontWeight: 700,
          letterSpacing: "1px",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-2)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </h3>

      <div
        className="scroll-y"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          maxHeight,
          paddingRight: 4,
        }}
      >
        {list.length === 0 ? (
          <div
            style={{
              fontSize: "var(--font-xs)",
              color: "var(--color-text-muted)",
              padding: "var(--space-3)",
              textAlign: "center",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {emptyHint}
          </div>
        ) : (
          list.map((item) => (
            <KeyRow
              key={item.id}
              item={item}
              providerLabel={label}
              onDelete={onDeleteKey}
            />
          ))
        )}
      </div>
    </section>
  );
}