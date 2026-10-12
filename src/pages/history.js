// src/pages/history.js
// Nhiệm vụ: Lịch sử trò chuyện.
// - Hiển thị TẤT CẢ hội thoại không thuộc dự án
// - Hội thoại trong dự án KHÔNG hiện ở đây
// - Có nút "Xóa tất cả" dưới danh sách

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import ConversationItem from "../components/ConversationItem.js";
import EmptyState from "../components/EmptyState.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";

export default function History() {
  const navigate = useNavigate();
  const { confirm, showToast } = useUI();
  const {
    recentConversations,
    loadRecentConversations,
    openConversation,
    deleteConversation,
    deleteAllConversations,
  } = useChat();

  useEffect(() => {
    loadRecentConversations();
  }, [loadRecentConversations]);

  const handleOpen = async (convo) => {
    const res = await openConversation(convo.id);
    if (res?.ok) navigate("/");
    else showToast(res?.error || "Không mở được cuộc trò chuyện", "error", 4000);
  };

  const handleDelete = async (convo) => {
    const res = await deleteConversation(convo.id);
    if (res?.ok) showToast("Đã xóa cuộc trò chuyện", "success", 2000);
    else showToast(res?.error || "Xóa thất bại", "error", 4000);
  };

  const handleDeleteAll = async () => {
    if (recentConversations.length === 0) {
      showToast("Không có cuộc trò chuyện nào để xóa", "info", 2000);
      return;
    }

    const yes = await confirm({
      title: "Xóa tất cả lịch sử",
      message: `Bạn có chắc muốn xóa TẤT CẢ ${recentConversations.length} cuộc trò chuyện trong lịch sử? Hành động này không thể hoàn tác.`,
      confirmText: "Xóa tất cả",
      cancelText: "Hủy",
      tone: "danger",
    });
    if (!yes) return;

    const res = await deleteAllConversations();
    if (res?.ok) {
      showToast(
        `Đã xóa ${res.deleted || 0} cuộc trò chuyện`,
        "success",
        2500
      );
    } else {
      showToast(res?.error || "Xóa tất cả thất bại", "error", 4000);
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
      <HeaderBar variant="sub" title="🕘 Lịch sử trò chuyện" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        {recentConversations.length === 0 ? (
          <EmptyState
            icon="🕘"
            title="Chưa có cuộc trò chuyện nào"
            subtitle="Các cuộc trò chuyện gần đây sẽ xuất hiện ở đây."
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {recentConversations.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                onOpen={handleOpen}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {recentConversations.length > 0 ? (
          <button
            type="button"
            onClick={handleDeleteAll}
            className="no-select"
            style={{
              marginTop: "var(--space-5)",
              width: "100%",
              minHeight: 48,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-error)",
              color: "var(--color-error)",
              fontSize: "var(--font-base)",
              fontWeight: 700,
              backgroundColor: "rgba(239, 68, 68, 0.08)",
            }}
          >
            🗑 Xóa tất cả lịch sử
          </button>
        ) : null}

        <div
          style={{
            marginTop: "var(--space-4)",
            textAlign: "center",
            fontSize: "var(--font-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          Hiển thị tất cả cuộc trò chuyện không thuộc dự án.
        </div>
      </div>
    </div>
  );
}