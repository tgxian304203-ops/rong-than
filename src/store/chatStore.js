// src/store/chatStore.js
// Nhiệm vụ: Quản lý hội thoại và tin nhắn.
// - Lịch sử: TẤT CẢ hội thoại không thuộc dự án
// - Có hàm deleteAllConversations

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import * as chatApi from "../api/chat.js";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [recentConversations, setRecentConversations] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [abortController, setAbortController] = useState(null);

  // ============================================================
  // TẠO HỘI THOẠI MỚI
  // ============================================================
  const createConversation = useCallback(
    async ({ projectId = null, title = null } = {}) => {
      setError(null);
      try {
        const res = await chatApi.createConversation({ projectId, title });
        const convo = res?.conversation;
        const convoId = convo?.id || convo?._id;
        if (convoId) {
          setActiveConversationId(convoId);
          setMessages([]);
        }
        return { ok: true, conversation: convo };
      } catch (err) {
        const msg = err?.message || "Không tạo được cuộc trò chuyện";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

  // ============================================================
  // MỞ HỘI THOẠI
  // ============================================================
  const openConversation = useCallback(async (conversationId) => {
    setError(null);
    try {
      const res = await chatApi.getMessages(conversationId);
      setActiveConversationId(conversationId);
      setMessages(res?.items || []);
      return { ok: true };
    } catch (err) {
      const msg = err?.message || "Không mở được cuộc trò chuyện";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  // ============================================================
  // GỬI TIN NHẮN
  // ============================================================
  const sendMessage = useCallback(
    async ({ text, attachments }) => {
      setSending(true);
      setError(null);

      let conversationId = activeConversationId;

      if (!conversationId) {
        const created = await createConversation({});
        if (!created.ok) {
          setSending(false);
          return {
            ok: false,
            error: created.error || "Không tạo được hội thoại",
          };
        }
        conversationId =
          created.conversation?.id || created.conversation?._id;
        if (!conversationId) {
          setSending(false);
          return { ok: false, error: "Hội thoại mới không có id" };
        }
      }

      const controller = new AbortController();
      setAbortController(controller);

      const tempUserMsg = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        text: text || "",
        attachments: attachments || [],
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const res = await chatApi.sendMessage({
          conversationId,
          text,
          attachments,
          signal: controller.signal,
        });

        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
          const next = [...withoutTemp];
          if (res?.userMessage) next.push(res.userMessage);
          if (res?.aiMessage) next.push(res.aiMessage);
          return next;
        });

        // Reload lịch sử để cập nhật tên hội thoại mới
        try {
          await loadRecentConversations();
        } catch {
          /* bỏ qua */
        }

        return {
          ok: true,
          userMessage: res?.userMessage,
          aiMessage: res?.aiMessage,
        };
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempUserMsg.id
              ? { ...m, pending: false, failed: true }
              : m
          )
        );
        const msg = err?.message || "Gửi tin nhắn thất bại";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setSending(false);
        setAbortController(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeConversationId, createConversation]
  );

  // ============================================================
  // HỦY GỬI
  // ============================================================
  const cancelSend = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setSending(false);
    }
  }, [abortController]);

  // ============================================================
  // LỊCH SỬ — LẤY TẤT CẢ
  // ============================================================
  const loadRecentConversations = useCallback(async () => {
    setError(null);
    try {
      const res = await chatApi.listRecentConversations({});
      setRecentConversations(res?.items || []);
      return { ok: true, items: res?.items || [] };
    } catch (err) {
      const msg = err?.message || "Không tải được lịch sử";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  // ============================================================
  // XÓA 1 HỘI THOẠI
  // ============================================================
  const deleteConversation = useCallback(
    async (conversationId) => {
      setError(null);
      try {
        await chatApi.deleteConversation(conversationId);
        setRecentConversations((prev) =>
          prev.filter((c) => c.id !== conversationId)
        );
        if (activeConversationId === conversationId) {
          setActiveConversationId(null);
          setMessages([]);
        }
        return { ok: true };
      } catch (err) {
        const msg = err?.message || "Xóa cuộc trò chuyện thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [activeConversationId]
  );

  // ============================================================
  // XÓA TẤT CẢ HỘI THOẠI
  // ============================================================
  const deleteAllConversations = useCallback(async () => {
    setError(null);
    try {
      const res = await chatApi.deleteAllConversations();
      setRecentConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return { ok: true, deleted: res?.deleted || 0 };
    } catch (err) {
      const msg = err?.message || "Xóa tất cả thất bại";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  // ============================================================
  // RESET
  // ============================================================
  const reset = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setSending(false);
  }, []);

  const value = useMemo(
    () => ({
      activeConversationId,
      messages,
      recentConversations,
      sending,
      error,
      createConversation,
      openConversation,
      sendMessage,
      cancelSend,
      loadRecentConversations,
      deleteConversation,
      deleteAllConversations,
      reset,
    }),
    [
      activeConversationId,
      messages,
      recentConversations,
      sending,
      error,
      createConversation,
      openConversation,
      sendMessage,
      cancelSend,
      loadRecentConversations,
      deleteConversation,
      deleteAllConversations,
      reset,
    ]
  );

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat phải dùng bên trong <ChatProvider>");
  return ctx;
}