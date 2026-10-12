// src/pages/projects-list.js
// Nhiệm vụ: Danh sách dự án.
// Quy tắc dự án (PHẦN 04, mục 6):
//   - Nút ← quay lại, tiêu đề 📁 DỰ ÁN
//   - "Dự án của tôi" + nút ＋ tạo dự án mới
//   - Ô tìm kiếm dự án
//   - Thẻ dự án: tên + mô tả + nút × xóa
//   - Xóa phải xác nhận
//   - KHÔNG tạo dữ liệu giả khi backend chưa xác nhận

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import ProjectCard from "../components/ProjectCard.js";
import EmptyState from "../components/EmptyState.js";
import { useProject } from "../store/projectStore.js";
import { useUI } from "../store/uiStore.js";

export default function ProjectsList() {
  const navigate = useNavigate();
  const { confirm, showToast } = useUI();
  const {
    filteredProjects,
    loading,
    error,
    search,
    setSearch,
    loadProjects,
    createProject,
    deleteProject,
  } = useProject();

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleOpen = (project) => {
    navigate(`/projects/${encodeURIComponent(project.id)}`);
  };

  const handleDelete = async (project) => {
    const res = await deleteProject(project.id);
    if (res?.ok) showToast("Đã xóa dự án", "success", 2000);
    else showToast(res?.error || "Xóa dự án thất bại", "error", 4000);
  };

  const handleCreate = async () => {
    const name = window.prompt("Nhập tên dự án mới:");
    if (!name || !name.trim()) return;

    setCreating(true);
    const res = await createProject({ name: name.trim(), description: "" });
    setCreating(false);

    if (res?.ok) showToast("Đã tạo dự án", "success", 2000);
    else showToast(res?.error || "Tạo dự án thất bại", "error", 4000);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <HeaderBar variant="sub" title="📁 Dự án" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        {/* TIÊU ĐỀ + NÚT ＋ */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-3)",
          }}
        >
          <h1
            style={{
              fontSize: "var(--font-lg)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Dự án của tôi
          </h1>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            aria-label="Tạo dự án mới"
            className="no-select glass-card"
            style={{
              width: 44,
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-xl)",
              color: "var(--color-ai-text)",
              borderRadius: "var(--radius-md)",
            }}
          >
            ＋
          </button>
        </div>

        {/* TÌM KIẾM */}
        <div
          className="glass-card"
          style={{
            display: "grid",
            gridTemplateColumns: "36px 1fr",
            alignItems: "center",
            minHeight: 44,
            padding: "0 var(--space-2)",
            marginBottom: "var(--space-4)",
          }}
        >
          <span aria-hidden="true" style={{ textAlign: "center" }}>
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm dự án..."
            style={{
              width: "100%",
              height: 44,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-base)",
            }}
          />
        </div>

        {/* DANH SÁCH */}
        {loading ? (
          <EmptyState icon="⏳" title="Đang tải dự án…" />
        ) : error ? (
          <EmptyState icon="⚠" title="Không tải được dự án" subtitle={error} />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon="📁"
            title={
              search
                ? "Không tìm thấy dự án phù hợp"
                : "Chưa có dự án nào"
            }
            subtitle={search ? "" : "Nhấn ＋ để tạo dự án mới"}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={handleOpen}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}