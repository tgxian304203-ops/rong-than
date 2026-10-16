// src/components/InputBar.js
// Nhiệm vụ: Thanh nhập tin nhắn + tệp đính kèm.
// Đã thay ＋ và ➤ bằng SVG.

import React, { useEffect, useRef, useState } from "react";
import AttachMenu from "./AttachMenu.js";
import AttachmentChip from "./AttachmentChip.js";
import { isBlankMessage } from "../utils/validate.js";
import { IconPlus, IconSend } from "./Icons.js";

const MAX_LINES = 6;
const LINE_HEIGHT = 22;
const PADDING_Y = 22;
const KEYBOARD_GAP_PX = 4;

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function InputBar({ onSend, sending = false, disabled = false }) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const iOS = isIOS();

  useEffect(() => {
    if (!iOS) return;
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const gap = window.innerHeight - (vv.height + vv.offsetTop);
      setKeyboardOffset(gap > 0 ? gap : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [iOS]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = LINE_HEIGHT * MAX_LINES + PADDING_Y;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text]);

  const handleSend = async () => {
    if (sending || disabled) return;
    if (isBlankMessage(text, attachments)) return;

    const payload = {
      text: text.trim(),
      attachments: [...attachments],
    };

    setText("");
    setAttachments([]);
    setAttachOpen(false);

    await onSend?.(payload);
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

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

  const iosTranslateY =
    iOS && keyboardOffset > 0 ? -(keyboardOffset + KEYBOARD_GAP_PX) : 0;

  return (
    <div
      style={{
        position: "relative",
        transform: iOS ? `translateY(${iosTranslateY}px)` : "none",
        transition: iOS ? "transform 0.15s ease-out" : "none",
        paddingBottom: `${KEYBOARD_GAP_PX}px`,
        paddingLeft: "var(--space-2)",
        paddingRight: "var(--space-2)",
        paddingTop: "var(--space-2)",
        backgroundColor: "transparent",
        zIndex: 20,
      }}
    >
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
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <IconPlus size={22} />
        </button>

        <AttachMenu
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          onPickFiles={handlePickFiles}
          onPickImages={handlePickImages}
          onPickCamera={handlePickCamera}
        />

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
            borderRadius: "var(--radius-md)",
            color: canSend ? "var(--color-ai-text)" : "var(--color-text-muted)",
          }}
        >
          {sending ? "…" : <IconSend size={20} />}
        </button>
      </div>
    </div>
  );
}