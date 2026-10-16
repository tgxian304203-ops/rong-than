// src/utils/format.js
// Nhiệm vụ: Định dạng hiển thị.
// getFileIcon() giờ trả về TÊN icon (string) để map sang SVG component.

// ============================================================
// THỜI GIAN
// ============================================================

export function formatTime(input) {
  const date = toDate(input);
  if (!date) return "";
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function formatDate(input) {
  const date = toDate(input);
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function formatDateTime(input) {
  const date = toDate(input);
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

export function formatRelativeTime(input) {
  const date = toDate(input);
  if (!date) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 30) return "vừa xong";
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hôm qua";
  if (days < 7) return `${days} ngày trước`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} tuần trước`;
  return formatDate(date);
}

// ============================================================
// KÍCH THƯỚC TỆP
// ============================================================

export function formatFileSize(bytes) {
  if (typeof bytes !== "number" || bytes < 0 || Number.isNaN(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ============================================================
// LOẠI TỆP — TRẢ VỀ TÊN ICON (map sang SVG)
// ============================================================

export function getFileExtension(filename) {
  if (!filename || typeof filename !== "string") return "";
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  return filename.slice(idx + 1).toLowerCase();
}

/**
 * Trả về TÊN icon (string) — caller map sang SVG component.
 * Giá trị trả về:
 *   "image" | "code" | "audio" | "video" | "file"
 */
export function getFileIcon(filename) {
  const ext = getFileExtension(filename);
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "svg"].includes(ext)) return "image";
  if (
    ["js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "go", "rs", "rb",
     "php", "html", "css", "json", "xml", "yml", "yaml", "md"].includes(ext)
  )
    return "code";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  return "file";
}

// ============================================================
// VĂN BẢN
// ============================================================

export function truncate(text, max = 60) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function conversationTitleFromMessage(text, max = 40) {
  if (!text || typeof text !== "string") return "Cuộc trò chuyện mới";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Cuộc trò chuyện mới";
  return truncate(cleaned, max);
}

// ============================================================
// SỐ
// ============================================================

export function formatNumber(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "0";
  return n.toLocaleString("vi-VN");
}

// ============================================================
// NỘI BỘ
// ============================================================

function toDate(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}