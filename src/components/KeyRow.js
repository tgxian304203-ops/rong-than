// src/components/KeyRow.js
// Nhiệm vụ: Một dòng key trong nhóm nhà cung cấp.
// GIỮ 🔥 (còn quota) và 😓 (hết quota) — đây là quy tắc giao diện dự án.

import React from "react";
import { useUI } from "../store/uiStore.js";
import { IconClose } from "./Icons.js";

export default function KeyRow({ item, onDelete, providerLabel = "" }) {
  const { confirm } = useUI();

  const quota = item?.quota === "out" ? "out" : "ok";
  const quotaIcon = quota === "out" ? "😓" : "🔥";
  const quotaLabel = quota === "out" ? "Hết quota" : "Còn quota";

  const handleDelete = async () => {
    const yes = await confirm({
      title: "Xóa API Key",
      message: `Bạn có chắc muốn xóa key ${item?.maskedKey || ""}${
        providerLabel ? ` (${providerLabel})` : ""
      }?`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      tone: "danger",
    });
    if (!yes) return;
    onDelete?.(item);
  };

  return (
    <div
      className="glass-card"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 40px 40px",
        alignItems: "center",
        padding: "var(--space-2) var(--space-2) var(--space-2) var(--space-3)",
        gap: "var(--space-1)",
      }}
    >
      <div
        style={{
          fontSize: "var(--font-sm)",
          color: "var(--color-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        }}
        title={item?.maskedKey || ""}
      >
        {item?.maskedKey || "••••"}
      </div>

      <div
        aria-label={quotaLabel}
        title={quotaLabel}
        style={{
          width: 40,
          height: 40,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--font-md)",
        }}
      >
        {quotaIcon}
      </div>

      <button
        type="button"
        aria-label="Xóa key này"
        onClick={handleDelete}
        className="no-select"
        style={{
          width: 40,
          height: 40,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-secondary)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <IconClose size={18} />
      </button>
    </div>
  );
}