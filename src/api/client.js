// src/api/client.js
// Nhiệm vụ: HTTP client nền cho toàn bộ API
// - Base URL
// - Gắn token xác thực
// - Xử lý JSON
// - Chuẩn hóa lỗi
// - Không báo thành công khi backend chưa xác nhận

const BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "/api";

const TOKEN_STORAGE_KEY = "rong_than_token";

// ============================================================
// TOKEN
// ============================================================

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
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

/**
 * Gọi API.
 * @param {string} path - ví dụ "/auth/login"
 * @param {object} options
 * @param {string} [options.method]
 * @param {object} [options.body]
 * @param {object} [options.headers]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.isFormData]
 * @returns {Promise<any>} dữ liệu JSON đã parse
 */
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

  // Token
  const token = getToken();
  if (token) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
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

    // Token hết hạn → xóa token
    if (res.status === 401) {
      clearToken();
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
    request(path, { ...options, method: "POST", body: formData, isFormData: true }),
};

export default api;