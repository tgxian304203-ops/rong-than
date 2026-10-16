// src/components/ProjectCard.js
// Nhiệm vụ: Thẻ dự án trong danh sách dự án.

import React from "react";
import { useUI } from "../store/uiStore.js";
import { IconFolder, IconClose } from "./Icons.js";

export default function ProjectCard({ project, onOpen, onDelete }) {
  const { confirm } = useUI();

  const handleDelete = async (e) => {
    e.stopPropagation();
    const yes = await confirm({
      title: "Xóa dự án",
      message: `Bạn có chắc muốn xóa dự án "${project?.name || ""}"? Toàn bộ cuộc trò chuyện bên trong cũng sẽ bị xóa.`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      tone: "danger",
    });
    if (!yes) return;
    onDelete?.(project);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(project)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(project);
        }
      }}
      className="glass-card no-select"
      style={{
        position: "relative",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontSize: "var(--font-md)",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          paddingRight: 36,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
        title={project?.name || ""}
      >
        <IconFolder size={18} />
        {project?.name || "(không tên)"}
      </div>

      {project?.description ? (
        <div
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
            paddingRight: 36,
            paddingLeft: 26,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={project.description}
        >
          {project.description}
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Xóa dự án"
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
          color: "var(--color-text-secondary)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <IconClose size={18} />
      </button>
    </div>
  );
}