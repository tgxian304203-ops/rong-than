// src/api/client.js
// Nhiệm vụ: HTTP client nền cho toàn bộ API
// - Base URL
// - Gắn X-User-Id (theo cách xác thực của dự án — không dùng JWT)
// - Xử lý JSON
// - Chuẩn hóa lỗi
// - Không báo thành công khi backend chưa xác nhận

const BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "/api";

const USER_ID_STORAGE_KEY = "rong_than_user_id";

// ============================================================
// USER ID (thay cho token — dự án không dùng JWT)
// ============================================================

export function getStoredUserId() {
  try {
    return localStorage.getItem(USER_ID_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredUserId(userId) {
  try {
    if (userId) localStorage.setItem(USER_ID_STORAGE_KEY, String(userId));
    else localStorage.removeItem(USER_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStoredUserId() {
  try {
    localStorage.removeItem(USER_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ============================================================
// LỖI CHUẨN
// ============================================================

export class ApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================
// REQUEST
// ============================================================

export async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    isFormData = false,
  } = options;

  const url = `${BASE_URL}${path}`;
  const finalHeaders = { ...headers };

  // Gắn X-User-Id (backend đọc header này để biết user)
  const userId = getStoredUserId();
  if (userId) {
    finalHeaders["X-User-Id"] = userId;
  }

  // Body
  let finalBody = undefined;
  if (body !== undefined) {
    if (isFormData) {
      finalBody = body;
    } else {
      finalHeaders["Content-Type"] = "application/json";
      finalBody = JSON.stringify(body);
    }
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal,
      credentials: "include",
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new ApiError("Yêu cầu đã bị hủy", { code: "ABORTED" });
    }
    throw new ApiError("Không kết nối được tới server", {
      code: "NETWORK_ERROR",
      details: err?.message,
    });
  }

  // Đọc nội dung
  const contentType = res.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && data.message) ||
      (typeof data === "string" && data) ||
      `Lỗi ${res.status}`;
    const code =
      (data && typeof data === "object" && data.code) || `HTTP_${res.status}`;
    const details =
      (data && typeof data === "object" && data.details) || null;

    // 401 → xóa user id
    if (res.status === 401) {
      clearStoredUserId();
    }

    throw new ApiError(message, { status: res.status, code, details });
  }

  return data;
}

// ============================================================
// SHORTHAND
// ============================================================

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  del: (path, options) => request(path, { ...options, method: "DELETE" }),
  upload: (path, formData, options) =>
    request(path, {
      ...options,
      method: "POST",
      body: formData,
      isFormData: true,
    }),
};

export default api;