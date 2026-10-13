// src/api/client.js
// Nhiệm vụ: HTTP client nền.
// Timeout 600s (10 phút) — đủ cho dò động + Sandbox + chunk.

const BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "/api";

const USER_ID_STORAGE_KEY = "rong_than_user_id";

// ============================================================
// TIMEOUT — 600 giây (10 phút)
// ============================================================
const REQUEST_TIMEOUT_MS = 600000;

// ============================================================
// USER ID
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
// LỖI
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

  const userId = getStoredUserId();
  if (userId) {
    finalHeaders["X-User-Id"] = userId;
  }

  let finalBody = undefined;
  if (body !== undefined) {
    if (isFormData) {
      finalBody = body;
    } else {
      finalHeaders["Content-Type"] = "application/json";
      finalBody = JSON.stringify(body);
    }
  }

  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), REQUEST_TIMEOUT_MS);

  const finalSignal = signal
    ? combineAbortSignals(signal, timeoutCtrl.signal)
    : timeoutCtrl.signal;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal: finalSignal,
      credentials: "include",
    });
  } catch (err) {
    clearTimeout(timeoutId);

    if (err?.name === "AbortError") {
      if (timeoutCtrl.signal.aborted) {
        throw new ApiError(
          "Yêu cầu quá thời gian (600 giây). Vui lòng thử lại.",
          { code: "TIMEOUT" }
        );
      }
      throw new ApiError("Yêu cầu đã bị hủy", { code: "ABORTED" });
    }

    throw new ApiError("Không kết nối được tới server", {
      code: "NETWORK_ERROR",
      details: err?.message,
    });
  } finally {
    clearTimeout(timeoutId);
  }

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

    if (res.status === 401) {
      clearStoredUserId();
    }

    throw new ApiError(message, { status: res.status, code, details });
  }

  return data;
}

// ============================================================
// KẾT HỢP 2 ABORT SIGNAL
// ============================================================

function combineAbortSignals(s1, s2) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();

  if (s1.aborted || s2.aborted) {
    ctrl.abort();
  } else {
    s1.addEventListener("abort", onAbort, { once: true });
    s2.addEventListener("abort", onAbort, { once: true });
  }

  return ctrl.signal;
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