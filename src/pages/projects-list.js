// src/pages/projects-list.js
// Nhiệm vụ: Danh sách dự án.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import ProjectCard from "../components/ProjectCard.js";
import EmptyState from "../components/EmptyState.js";
import { useProject } from "../store/projectStore.js";
import { useUI } from "../store/uiStore.js";
import { IconPlus, IconSearch } from "../components/Icons.js";

export default function ProjectsList() {
  const navigate = useNavigate();
  const { showToast } = useUI();
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

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

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

  const openCreateModal = () => {
    setNewName("");
    setNewDesc("");
    setFormError("");
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (submitting) return;
    setCreateModalOpen(false);
  };

  const handleCreateSubmit = async () => {
    setFormError("");
    const name = newName.trim();
    if (!name) {
      setFormError("Tên dự án không được để trống");
      return;
    }
    if (name.length > 80) {
      setFormError("Tên dự án không vượt quá 80 ký tự");
      return;
    }

    setSubmitting(true);
    const res = await createProject({ name, description: newDesc.trim() });
    setSubmitting(false);

    if (res?.ok) {
      showToast("Đã tạo dự án", "success", 2000);
      setCreateModalOpen(false);
    } else {
      setFormError(res?.error || "Tạo dự án thất bại");
    }
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
      <HeaderBar variant="sub" title="Dự án" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
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
            onClick={openCreateModal}
            aria-label="Tạo dự án mới"
            className="no-select glass-card"
            style={{
              width: 44,
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-ai-text)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <IconPlus size={22} />
          </button>
        </div>

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
          <span
            style={{
              display: "inline-flex",
              justifyContent: "center",
              color: "var(--color-text-muted)",
            }}
          >
            <IconSearch size={18} />
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

        {loading ? (
          <EmptyState icon="loader" title="Đang tải dự án…" />
        ) : error ? (
          <EmptyState icon="warning" title="Không tải được dự án" subtitle={error} />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon="folder"
            title={search ? "Không tìm thấy dự án phù hợp" : "Chưa có dự án nào"}
            subtitle={search ? "" : "Nhấn nút + để tạo dự án mới"}
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

      {createModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tạo dự án mới"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: "var(--z-dialog)",
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <div
            className="glass-dialog"
            style={{
              width: "100%",
              maxWidth: 460,
              padding: "var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                fontSize: "var(--font-lg)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
              }}
            >
              Tạo dự án mới
            </div>

            <div>
              <div
                style={{
                  fontSize: "var(--font-sm)",
                  color: "var(--color-text-secondary)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Tên dự án
              </div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nhập tên dự án..."
                autoFocus
                className="glass-card"
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 var(--space-3)",
                  color: "var(--color-text-primary)",
                  fontSize: "var(--font-base)",
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: "var(--font-sm)",
                  color: "var(--color-text-secondary)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Mô tả (không bắt buộc)
              </div>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Mô tả ngắn..."
                className="glass-card"
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 var(--space-3)",
                  color: "var(--color-text-primary)",
                  fontSize: "var(--font-base)",
                }}
              />
            </div>

            {formError ? (
              <div
                style={{
                  color: "var(--color-error)",
                  fontSize: "var(--font-sm)",
                  textAlign: "center",
                }}
              >
                {formError}
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-2)",
                marginTop: "var(--space-2)",
              }}
            >
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={submitting}
                className="no-select"
                style={{
                  minHeight: 44,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-text-primary)",
                  fontSize: "var(--font-base)",
                  fontWeight: 600,
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateSubmit}
                disabled={submitting}
                className="no-select"
                style={{
                  minHeight: 44,
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-success)",
                  color: "#04150a",
                  fontSize: "var(--font-base)",
                  fontWeight: 700,
                }}
              >
                {submitting ? "Đang tạo…" : "Tạo dự án"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}