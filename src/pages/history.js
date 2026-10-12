// src/pages/history.js
// Nhiệm vụ: Lịch sử trò chuyện.
// Quy tắc dự án (PHẦN 04, mục 8):
//   - Hiển thị tối đa 10 cuộc trò chuyện MỚI NHẤT
//   - Cuộc trò chuyện cũ hơn KHÔNG bị xóa chỉ vì không nằm trong danh sách
//   - Mở đúng nội dung hội thoại tương ứng khi chọn
//   - KHÔNG tự xóa lịch sử cũ

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import ConversationItem from "../components/ConversationItem.js";
import EmptyState from "../components/EmptyState.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";

export default function History() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const {
    recentConversations,
    loadRecentConversations,
    openConversation,
    deleteConversation,
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

        <div
          style={{
            marginTop: "var(--space-5)",
            textAlign: "center",
            fontSize: "var(--font-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          Danh sách hiển thị tối đa 10 cuộc trò chuyện gần nhất.
        </div>
      </div>
    </div>
  );
}