// src/components/MessageList.js
// Nhiệm vụ: Vùng trò chuyện — hiển thị tin nhắn theo thứ tự hội thoại.
// Quy tắc dự án:
//   - Cuộn được để xem tin nhắn cũ
//   - Không để thanh nhập che khuất nội dung đang đọc
//   - Tự cuộn xuống cuối khi có tin nhắn mới (nếu đang ở gần cuối)
//   - Phân biệt rõ AI và User (đã xử lý ở MessageBubble)

import React, { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble.js";
import EmptyState from "./EmptyState.js";

export default function MessageList({ messages, loading }) {
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Theo dõi người dùng có đang ở gần cuối không
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distance < 120);
  };

  // Khi có tin nhắn mới → cuộn xuống nếu đang ở gần cuối
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, autoScroll]);

  // Lần đầu mở: cuộn xuống cuối
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="scroll-y"
      style={{
        flex: 1,
        paddingTop: "var(--space-4)",
        paddingBottom: "var(--space-4)",
        overflowAnchor: "none",
      }}
    >
      {loading && (!messages || messages.length === 0) ? (
        <div
          style={{
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-sm)",
            padding: "var(--space-6)",
          }}
        >
          Đang tải…
        </div>
      ) : messages && messages.length > 0 ? (
        messages.map((m) => <MessageBubble key={m.id} message={m} />)
      ) : (
        <EmptyState
          icon="🌕🐉"
          title="Xin chào! Tôi có thể giúp gì cho bạn hôm nay?"
          subtitle=""
        />
      )}
    </div>
  );
}