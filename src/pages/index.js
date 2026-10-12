// src/pages/index.js
// Nhiệm vụ: Màn hình chat chính.
// Thêm nút "🔧 Sửa tiếp" khi AI trả về code cần sửa tiếp.

import React, { useEffect, useRef, useState } from "react";
import HeaderBar from "../components/HeaderBar.js";
import MessageList from "../components/MessageList.js";
import InputBar from "../components/InputBar.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";

export default function ChatMain() {
  const {
    messages,
    sending,
    fixing,
    activeConversationId,
    sendMessage,
    fixContinue,
  } = useChat();
  const { showToast } = useUI();

  // Kiểm tra xem tin AI cuối có cần "Sửa tiếp" không
  const [showFixButton, setShowFixButton] = useState(false);

  useEffect(() => {
    const lastAI = [...messages].reverse().find((m) => m.role === "ai");
    if (!lastAI) {
      setShowFixButton(false);
      return;
    }
    // Cần nút Fix khi tin AI có meta.resumeAvailable = true
    const meta = lastAI.meta || null;
    setShowFixButton(!!meta?.resumeAvailable);
  }, [messages]);

  const handleSend = async (payload) => {
    const result = await sendMessage(payload);
    if (!result?.ok) {
      showToast(result?.error || "Gửi tin nhắn thất bại", "error", 4000);
    }
  };

  const handleFixContinue = async () => {
    const res = await fixContinue();
    if (!res?.ok) {
      showToast(res?.error || "Sửa tiếp thất bại", "error", 4000);
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
      <HeaderBar variant="main" />

      <MessageList messages={messages} />

      {/* Nút "Sửa tiếp" */}
      {showFixButton ? (
        <div
          style={{
            padding: "0 var(--space-3) var(--space-2)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={handleFixContinue}
            disabled={fixing || sending}
            className="no-select"
            style={{
              minHeight: 44,
              padding: "0 var(--space-4)",
              borderRadius: "var(--radius-md)",
              backgroundColor: fixing
                ? "rgba(249, 115, 22, 0.3)"
                : "rgba(249, 115, 22, 0.9)",
              color: "#fff",
              fontSize: "var(--font-base)",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            {fixing ? "⏳ Đang sửa tiếp…" : "🔧 Sửa tiếp"}
          </button>
        </div>
      ) : null}

      <InputBar
        onSend={handleSend}
        sending={sending || fixing}
        disabled={fixing}
      />
    </div>
  );
}