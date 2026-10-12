// src/api/logs.js
// Nhiệm vụ: API Rồng Thần Logs
// - Đọc log thật từ backend
// - Lọc theo mức
// - Tìm kiếm
// - Xóa log (trong phạm vi backend cho phép)
// - Tải log .txt

import api, { getToken } from "./client.js";

// ============================================================
// ĐỌC LOGS
// ============================================================

/**
 * @param {object} [opts]
 * @param {string} [opts.level] - "all" | "info" | "warn" | "error" | "debug"
 * @param {string} [opts.search]
 * @param {number} [opts.limit=200]
 * @param {string} [opts.cursor] - phân trang
 * @returns {Promise<{items: LogItem[], nextCursor: string|null, serverStatus: string}>}
 * LogItem = { id, timestamp, level, message }
 */
export async function fetchLogs({
  level = "all",
  search = "",
  limit = 200,
  cursor = null,
} = {}) {
  const params = new URLSearchParams();
  if (level && level !== "all") params.set("level", level);
  if (search) params.set("search", search);
  if (limit) params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);

  const q = params.toString();
  return api.get(`/logs${q ? `?${q}` : ""}`);
}

// ============================================================
// TRẠNG THÁI SERVER
// ============================================================

export async function getServerStatus() {
  return api.get("/logs/status");
}

// ============================================================
// XÓA LOGS
// ============================================================

/**
 * Xóa log trong phạm vi backend cho phép.
 * Phải xác nhận trước khi gọi.
 */
export async function clearLogs() {
  return api.post("/logs/clear", {});
}

// ============================================================
// TẢI LOGS (.txt)
// ============================================================

/**
 * Tải toàn bộ log trong phạm vi backend cho phép dưới dạng .txt
 * Trả về Blob, caller tự tạo link tải.
 * @param {object} [opts]
 * @returns {Promise<Blob>}
 */
export async function downloadLogsTxt({ level = "all", search = "" } = {}) {
  const params = new URLSearchParams();
  if (level && level !== "all") params.set("level", level);
  if (search) params.set("search", search);
  params.set("format", "txt");

  const base =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_BASE_URL) ||
    "/api";

  const url = `${base}/logs/export?${params.toString()}`;
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Không tải được log (HTTP ${res.status})`);
  }
  return res.blob();
}

// ============================================================
// LUỒNG CẬP NHẬT (nếu backend hỗ trợ SSE)
// ============================================================

/**
 * Mở kết nối SSE để nhận log mới.
 * @param {(item: object) => void} onItem
 * @param {(err: any) => void} [onError]
 * @returns {() => void} hàm hủy kết nối
 */
export function streamLogs(onItem, onError) {
  const base =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_BASE_URL) ||
    "/api";

  const token = getToken();
  const url = new URL(
    `${base}/logs/stream`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  if (token) url.searchParams.set("token", token);

  let es;
  try {
    es = new EventSource(url.toString());
  } catch (err) {
    onError?.(err);
    return () => {};
  }

  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onItem?.(data);
    } catch (err) {
      onError?.(err);
    }
  };

  es.onerror = (err) => {
    onError?.(err);
  };

  return () => {
    try {
      es.close();
    } catch {
      /* ignore */
    }
  };
}