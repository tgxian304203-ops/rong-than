// src/pages/project-detail.js
// Nhiệm vụ: Bên trong dự án.

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import ConversationItem from "../components/ConversationItem.js";
import EmptyState from "../components/EmptyState.js";
import { useProject } from "../store/projectStore.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";
import { IconPlus, IconMessage, IconHistory } from "../components/Icons.js";

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const {
    activeProject,
    projectConversations,
    loading,
    error,
    openProject,
    createConversationInProject,
    deleteConversationInProject,
  } = useProject();
  const { openConversation } = useChat();

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (projectId) openProject(projectId);
  }, [projectId, openProject]);

  const handleOpenConversation = async (convo) => {
    const res = await openConversation(convo.id);
    if (res?.ok) navigate("/");
    else showToast(res?.error || "Không mở được cuộc trò chuyện", "error", 4000);
  };

  const handleCreateConversation = async () => {
    if (!projectId) return;
    setCreating(true);
    const res = await createConversationInProject(projectId, {});
    setCreating(false);
    if (res?.ok && res.conversation?.id) {
      const open = await openConversation(res.conversation.id);
      if (open?.ok) navigate("/");
      else showToast(open?.error || "Không mở được cuộc trò chuyện", "error", 4000);
    } else {
      showToast(res?.error || "Tạo cuộc trò chuyện thất bại", "error", 4000);
    }
  };

  const handleDeleteConversation = async (convo) => {
    const res = await deleteConversationInProject(projectId, convo.id);
    if (res?.ok) showToast("Đã xóa cuộc trò chuyện", "success", 2000);
    else showToast(res?.error || "Xóa cuộc trò chuyện thất bại", "error", 4000);
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
            fontSize: "var(--font-lg)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: "var(--space-5)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          {activeProject?.name || "Đang tải…"}
        </div>

        <h2
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            marginBottom: "var(--space-2)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <IconMessage size={16} />
          Cuộc trò chuyện
        </h2>

        <button
          type="button"
          onClick={handleCreateConversation}
          disabled={creating}
          className="glass-card no-select"
          style={{
            width: "100%",
            minHeight: 48,
            padding: "0 var(--space-4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: "var(--space-2)",
            color: "var(--color-ai-text)",
            fontSize: "var(--font-base)",
            fontWeight: 600,
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-5)",
          }}
        >
          <IconPlus size={20} />
          {creating ? "Đang tạo…" : "Cuộc trò chuyện mới"}
        </button>

        <h2
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            marginBottom: "var(--space-2)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <IconHistory size={16} />
          Lịch sử trong dự án
        </h2>

        {loading ? (
          <EmptyState icon="loader" title="Đang tải…" />
        ) : error ? (
          <EmptyState icon="warning" title="Lỗi tải dự án" subtitle={error} />
        ) : projectConversations.length === 0 ? (
          <EmptyState
            icon="message"
            title="Chưa có cuộc trò chuyện nào"
            subtitle="Nhấn + Cuộc trò chuyện mới để bắt đầu"
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {projectConversations.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                onOpen={handleOpenConversation}
                onDelete={handleDeleteConversation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}