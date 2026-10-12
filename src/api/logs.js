// src/api/logs.js
// Nhiệm vụ: API Rồng Thần Logs.
// - Đọc log thật từ backend
// - Lọc theo mức, tìm kiếm
// - Xóa log trong phạm vi backend cho phép
// - Tải log .txt

import api, { getStoredUserId } from "./client.js";

// ============================================================
// ĐỌC LOGS
// ============================================================

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

export async function clearLogs() {
  return api.post("/logs/clear", {});
}

// ============================================================
// TẢI LOGS (.txt)
// ============================================================

/**
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
  const userId = getStoredUserId();
  if (userId) headers["X-User-Id"] = userId;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Không tải được log (HTTP ${res.status})`);
  }
  return res.blob();
}

// ============================================================
// LUỒNG CẬP NHẬT (SSE — nếu backend hỗ trợ)
// ============================================================

export function streamLogs(onItem, onError) {
  const base =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_BASE_URL) ||
    "/api";

  const userId = getStoredUserId();
  const url = new URL(
    `${base}/logs/stream`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  if (userId) url.searchParams.set("userId", userId);

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