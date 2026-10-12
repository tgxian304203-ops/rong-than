// src/pages/index.js
// Nhiệm vụ: Màn hình chat chính.
// Quy tắc dự án (PHẦN 04, mục 2):
//   - Nút ☰ bên trái mở menu
//   - Logo 🌕🐉 nằm CHÍNH GIỮA phía trên
//   - Nút ⋮ bên phải mở Rồng Thần Logs
//   - Tin nhắn AI căn trái, User căn phải
//   - Thanh nhập ở dưới cùng: ＋ | ô nhập | ➤

import React, { useEffect } from "react";
import HeaderBar from "../components/HeaderBar.js";
import MessageList from "../components/MessageList.js";
import InputBar from "../components/InputBar.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";

export default function ChatMain() {
  const {
    messages,
    sending,
    activeConversationId,
    createConversation,
    sendMessage,
    reset,
  } = useChat();
  const { showToast } = useUI();

  // Đảm bảo có 1 hội thoại khi mở chat chính mà chưa có
  useEffect(() => {
    if (!activeConversationId) {
      // Không tự tạo ngay — để khi User gửi tin đầu tiên mới tạo.
      // Điều này tránh tạo hội thoại rỗng khi chỉ mở màn.
    }
  }, [activeConversationId]);

  const handleSend = async (payload) => {
    const result = await sendMessage(payload);
    if (!result?.ok) {
      showToast(result?.error || "Gửi tin nhắn thất bại", "error", 4000);
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
      {/* HEADER — variant main: ☰ | 🌕🐉 | ⋮ */}
      <HeaderBar variant="main" />

      {/* VÙNG TRÒ CHUYỆN */}
      <MessageList messages={messages} />

      {/* THANH NHẬP */}
      <InputBar onSend={handleSend} sending={sending} />
    </div>
  );
}