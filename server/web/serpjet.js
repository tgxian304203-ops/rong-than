// server/web/serpjet.js
// Nhiệm vụ: Gọi SerpJet (web search).
// Quy tắc dự án:
//   - KHÔNG tự đổi tên SerpJet thành nhà cung cấp khác.
//   - SerpJet chỉ dùng key từ nhóm Web.

import { WEB_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";

const SERPJET = WEB_PROVIDERS.serpjet;

// ============================================================
// KIỂM TRA KEY
// ============================================================

export async function verifyKey(rawKey) {
  const url = `${SERPJET.baseUrl}/search?q=ping&limit=1&api_key=${encodeURIComponent(
    rawKey
  )}`;

  try {
    const res = await fetchWithTimeout(
      url,
      { method: "GET" },
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
    `${SERPJET.baseUrl}/search?` +
    `q=${encodeURIComponent(query)}` +
    `&limit=${maxResults}` +
    `&api_key=${encodeURIComponent(rawKey)}`;

  try {
    const res = await fetchWithTimeout(
      url,
      { method: "GET", signal },
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

    // SerpJet có thể trả về organic_results / results / data
    const raw =
      body?.organic_results || body?.results || body?.data || [];

    const results = Array.isArray(raw)
      ? raw.map((r) => ({
          title: r.title || "",
          url: r.link || r.url || "",
          snippet: r.snippet || r.description || "",
          score: null,
        }))
      : [];

    return { ok: true, results };
  } catch (err) {
    return {
      ok: false,
      results: [],
      error: err?.message || "SerpJet search thất bại",
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