// src/components/ConversationItem.js
// Nhiệm vụ: Mục cuộc trò chuyện trong danh sách (lịch sử, dự án).
// Quy tắc dự án:
//   - Hiển thị tiêu đề cuộc trò chuyện
//   - Có nút × ở góc trên phải (nếu cho phép xóa)
//   - Xóa phải xác nhận
//   - Không xóa dự án chứa cuộc trò chuyện đó

import React from "react";
import { useUI } from "../store/uiStore.js";
import { formatRelativeTime } from "../utils/format.js";

export default function ConversationItem({
  conversation,
  onOpen,
  onDelete = null,
}) {
  const { confirm } = useUI();

  const handleDelete = async (e) => {
    e.stopPropagation();
    const yes = await confirm({
      title: "Xóa cuộc trò chuyện",
      message: `Bạn có chắc muốn xóa cuộc trò chuyện "${
        conversation?.title || "này"
      }"?`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      tone: "danger",
    });
    if (!yes) return;
    onDelete?.(conversation);
  };

  const time = formatRelativeTime(conversation?.updatedAt || conversation?.createdAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(conversation)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(conversation);
        }
      }}
      className="glass-card no-select"
      style={{
        position: "relative",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontSize: "var(--font-base)",
          color: "var(--color-text-primary)",
          paddingRight: onDelete ? 36 : 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={conversation?.title || ""}
      >
        💬 {conversation?.title || "Cuộc trò chuyện"}
      </div>

      {time ? (
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          {time}
        </div>
      ) : null}

      {onDelete ? (
        <button
          type="button"
          aria-label="Xóa cuộc trò chuyện"
          onClick={handleDelete}
          className="no-select"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 32,
            height: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--font-lg)",
            color: "var(--color-text-secondary)",
            borderRadius: "var(--radius-md)",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}