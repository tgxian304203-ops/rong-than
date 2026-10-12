// server/web/tavily.js
// Nhiệm vụ: Gọi Tavily (web search).
// - Kiểm tra key hợp lệ
// - Chạy tìm kiếm, trả kết quả đã chuẩn hóa
// Quy tắc dự án:
//   - Tavily chỉ dùng key từ nhóm Web.
//   - Không dùng key Đại Não/Tiểu Não.

import { WEB_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";

const TAVILY = WEB_PROVIDERS.tavily;

// ============================================================
// KIỂM TRA KEY
// ============================================================

/**
 * Gọi 1 query rất ngắn để kiểm tra key.
 */
export async function verifyKey(rawKey) {
  const url = `${TAVILY.baseUrl}/search`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: rawKey,
          query: "ping",
          max_results: 1,
        }),
      },
      LIMITS.MODEL_SCAN_TIMEOUT_MS
    );

    const body = await safeJson(res);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true };
    }
    return {
      ok: false,
      error: body?.detail || body?.message || `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err?.message || "Không kiểm tra được key" };
  }
}

// ============================================================
// TÌM KIẾM
// ============================================================

/**
 * @param {object} p
 * @param {string} p.rawKey
 * @param {string} p.query
 * @param {number} [p.maxResults]
 * @param {string} [p.topic]        - "general" | "news"
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, results: Array, error?: string}>}
 */
export async function search({
  rawKey,
  query,
  maxResults = 5,
  topic = "general",
  signal,
}) {
  const url = `${TAVILY.baseUrl}/search`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: rawKey,
          query,
          max_results: maxResults,
          topic,
          include_answer: true,
        }),
        signal,
      },
      LIMITS.PROVIDER_TIMEOUT_MS
    );

    const body = await safeJson(res);
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        results: [],
        error: body?.detail || body?.message || `HTTP ${res.status}`,
      };
    }

    const results = Array.isArray(body?.results)
      ? body.results.map((r) => ({
          title: r.title || "",
          url: r.url || "",
          snippet: r.content || r.snippet || "",
          score: typeof r.score === "number" ? r.score : null,
        }))
      : [];

    return {
      ok: true,
      results,
      answer: body?.answer || null,
    };
  } catch (err) {
    return {
      ok: false,
      results: [],
      error: err?.message || "Tavily search thất bại",
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