// src/pages/project-detail.js
// Nhiệm vụ: Bên trong dự án.
// Quy tắc dự án (PHẦN 04, mục 7):
//   - Nút ← Dự án quay lại danh sách dự án
//   - Nút ⋮ bên phải (chức năng gán khi đã xác định rõ)
//   - Tên dự án
//   - Mục Cuộc trò chuyện + nút ＋ Cuộc trò chuyện mới
//   - Mục Lịch sử trong dự án (các cuộc trò chuyện)
//   - Mỗi cuộc trò chuyện có × xóa (phải xác nhận)
//
// QUY TẮC BẮT BUỘC:
//   - MÀN HÌNH NÀY KHÔNG CÓ Ô NHẬP CHAT Ở DƯỚI CÙNG
//   - Phải mở 1 cuộc trò chuyện để vào giao diện chat

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import ConversationItem from "../components/ConversationItem.js";
import EmptyState from "../components/EmptyState.js";
import { useProject } from "../store/projectStore.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";

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
    if (res?.ok) {
      navigate("/");
    } else {
      showToast(res?.error || "Không mở được cuộc trò chuyện", "error", 4000);
    }
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
        {/* TÊN DỰ ÁN */}
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
          📁 {activeProject?.name || "Đang tải…"}
        </div>

        {/* MỤC CUỘC TRÒ CHUYỆN */}
        <h2
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            marginBottom: "var(--space-2)",
          }}
        >
          💬 Cuộc trò chuyện
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
          ＋ {creating ? "Đang tạo…" : "Cuộc trò chuyện mới"}
        </button>

        {/* MỤC LỊCH SỬ TRONG DỰ ÁN */}
        <h2
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            marginBottom: "var(--space-2)",
          }}
        >
          🕘 Lịch sử trong dự án
        </h2>

        {loading ? (
          <EmptyState icon="⏳" title="Đang tải…" />
        ) : error ? (
          <EmptyState icon="⚠" title="Lỗi tải dự án" subtitle={error} />
        ) : projectConversations.length === 0 ? (
          <EmptyState
            icon="💬"
            title="Chưa có cuộc trò chuyện nào"
            subtitle="Nhấn ＋ Cuộc trò chuyện mới để bắt đầu"
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