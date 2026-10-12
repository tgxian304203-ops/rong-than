// src/components/InputBar.js
// Nhiệm vụ: Thanh nhập tin nhắn + tệp đính kèm.
// Quy tắc dự án:
//   - Trái: ＋ mở AttachMenu
//   - Giữa: ô nhập tự mở rộng, tối đa 6 dòng, cho phép cuộn nội bộ
//   - Phải: ➤ gửi
//   - Enter xuống dòng, KHÔNG gửi
//   - Chỉ gửi khi nhấn nút ➤
//   - Khi bàn phím mở, thanh nhập nằm sát trên bàn phím
//   - Tệp đính kèm nằm phía trên thanh nhập
//   - Chip tệp có nút × riêng

import React, { useEffect, useRef, useState } from "react";
import AttachMenu from "./AttachMenu.js";
import AttachmentChip from "./AttachmentChip.js";
import { isBlankMessage } from "../utils/validate.js";

const MAX_LINES = 6;
const LINE_HEIGHT = 22;
const PADDING_Y = 22; // 11 top + 11 bottom

export default function InputBar({ onSend, sending = false, disabled = false }) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachOpen, setAttachOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // ============================================================
  // ĐIỀU CHỈNH CHIỀU CAO TEXTAREA
  // ============================================================
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = LINE_HEIGHT * MAX_LINES + PADDING_Y;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text]);

  // ============================================================
  // GỬI
  // ============================================================
  const handleSend = async () => {
    if (sending || disabled) return;
    if (isBlankMessage(text, attachments)) return;

    const payload = {
      text: text.trim(),
      attachments: [...attachments],
    };

    // Xóa trạng thái ngay để UI phản hồi tức thì
    setText("");
    setAttachments([]);
    setAttachOpen(false);

    await onSend?.(payload);
  };

  // ============================================================
  // BÀN PHÍM: Enter = xuống dòng (mặc định textarea)
  // Không gửi khi Enter.
  // ============================================================
  const handleKeyDown = (e) => {
    // Không chặn Enter — để mặc định xuống dòng.
    // Chỉ chặn Ctrl+Enter hoặc Cmd+Enter để gửi nhanh (tùy chọn).
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // ============================================================
  // CHỌN TỆP
  // ============================================================
  const addFiles = (files) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setAttachments((prev) => [...prev, ...arr]);
    setAttachOpen(false);
  };

  const handlePickFiles = () => fileInputRef.current?.click();
  const handlePickImages = () => imageInputRef.current?.click();
  const handlePickCamera = () => cameraInputRef.current?.click();

  const removeAttachment = (file) => {
    setAttachments((prev) => prev.filter((f) => f !== file));
  };

  const canSend = !isBlankMessage(text, attachments) && !sending && !disabled;

  return (
    <div
      className="safe-bottom"
      style={{
        position: "relative",
        padding: "var(--space-2) var(--space-2)",
        borderTop: "1px solid var(--color-border)",
        backgroundColor: "rgba(10,10,10,0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* INPUT ẨN */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* TỆP ĐÍNH KÈM */}
      {attachments.length > 0 ? (
        <div
          className="scroll-y"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            marginBottom: "var(--space-2)",
            maxHeight: 180,
          }}
        >
          {attachments.map((file, idx) => (
            <AttachmentChip
              key={`${file.name}-${idx}-${file.size}`}
              file={file}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      ) : null}

      {/* THANH NHẬP */}
      <div
        className="glass-inputbar"
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "44px 1fr 44px",
          alignItems: "end",
          gap: "var(--space-1)",
          padding: "var(--space-1)",
        }}
      >
        {/* NÚT ＋ */}
        <button
          type="button"
          aria-label="Thêm tệp đính kèm"
          onClick={() => setAttachOpen((v) => !v)}
          disabled={disabled}
          className="no-select"
          style={{
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--font-xl)",
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-md)",
          }}
        >
          ＋
        </button>

        <AttachMenu
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          onPickFiles={handlePickFiles}
          onPickImages={handlePickImages}
          onPickCamera={handlePickCamera}
        />

        {/* TEXTAREA */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn..."
          rows={1}
          disabled={disabled}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--color-text-primary)",
            fontSize: "var(--font-base)",
            lineHeight: `${LINE_HEIGHT}px`,
            padding: "11px 4px",
            maxHeight: LINE_HEIGHT * MAX_LINES + PADDING_Y,
          }}
        />

        {/* NÚT GỬI */}
        <button
          type="button"
          aria-label="Gửi tin nhắn"
          onClick={handleSend}
          disabled={!canSend}
          className="no-select"
          style={{
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--font-lg)",
            borderRadius: "var(--radius-md)",
            color: canSend ? "var(--color-ai-text)" : "var(--color-text-muted)",
          }}
        >
          {sending ? "…" : "➤"}
        </button>
      </div>
    </div>
  );
}