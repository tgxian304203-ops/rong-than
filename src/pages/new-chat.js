// src/pages/new-chat.js
// Nhiệm vụ: Tạo cuộc trò chuyện mới và mở màn hình chat.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import EmptyState from "../components/EmptyState.js";
import { useChat } from "../store/chatStore.js";
import { useUI } from "../store/uiStore.js";

export default function NewChat() {
  const navigate = useNavigate();
  const { createConversation, reset } = useChat();
  const { showToast } = useUI();
  const [creating, setCreating] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      reset();
      const result = await createConversation({});
      if (cancelled) return;

      if (result?.ok) {
        showToast("Đã tạo cuộc trò chuyện mới", "success", 2000);
        navigate("/", { replace: true });
      } else {
        setError(result?.error || "Không tạo được cuộc trò chuyện");
        setCreating(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [createConversation, reset, navigate, showToast]);

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
      <HeaderBar variant="sub" title="New Chat" />

      <div
        className="scroll-y"
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {creating ? (
          <EmptyState icon="loader" title="Đang tạo cuộc trò chuyện mới…" />
        ) : error ? (
          <EmptyState
            icon="warning"
            title="Không tạo được cuộc trò chuyện"
            subtitle={error}
            action={
              <button
                type="button"
                onClick={() => navigate("/")}
                className="no-select"
                style={{
                  minHeight: 44,
                  padding: "0 var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-text-primary)",
                  fontWeight: 600,
                }}
              >
                Quay về chat
              </button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}