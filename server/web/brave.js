// server/web/brave.js
// Nhiệm vụ: Gọi Brave Search.
// Quy tắc dự án:
//   - Brave chỉ dùng key từ nhóm Web.

import { WEB_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";

const BRAVE = WEB_PROVIDERS.brave;

// ============================================================
// KIỂM TRA KEY
// ============================================================

export async function verifyKey(rawKey) {
  const url = `${BRAVE.baseUrl}${BRAVE.verifyPath}?q=ping&count=1`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": rawKey,
        },
      },
      LIMITS.MODEL_SCAN_TIMEOUT_MS
    );

    const body = await safeJson(res);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true };
    }
    return {
      ok: false,
      error: body?.message || body?.error || `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err?.message || "Không kiểm tra được key" };
  }
}

// ============================================================
// TÌM KIẾM
// ============================================================

export async function search({
  rawKey,
  query,
  maxResults = 5,
  signal,
}) {
  const url =
    `${BRAVE.baseUrl}${BRAVE.verifyPath}?` +
    `q=${encodeURIComponent(query)}` +
    `&count=${maxResults}`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": rawKey,
        },
        signal,
      },
      LIMITS.PROVIDER_TIMEOUT_MS
    );

    const body = await safeJson(res);
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        results: [],
        error: body?.message || body?.error || `HTTP ${res.status}`,
      };
    }

    const raw =
      body?.web?.results ||
      body?.results ||
      [];

    const results = Array.isArray(raw)
      ? raw.map((r) => ({
          title: r.title || "",
          url: r.url || "",
          snippet: r.description || r.snippet || "",
          score: null,
        }))
      : [];

    return { ok: true, results };
  } catch (err) {
    return {
      ok: false,
      results: [],
      error: err?.message || "Brave search thất bại",
    };
  }
}

// ============================================================
// TIỆN ÍCH
// ============================================================

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  const callerSignal = options.signal;
  if (callerSignal) {
    callerSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default { verifyKey, search };