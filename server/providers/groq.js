// server/providers/groq.js
// Nhiệm vụ: Kết nối Groq.
// - Kiểm tra key có hợp lệ không
// - Gọi model (chat completion)
// - Đọc quota nếu có

import { MODEL_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";
import { withRetry, assertOkResponse } from "./retry.js";

const GROQ = MODEL_PROVIDERS.groq;

// ============================================================
// KIỂM TRA KEY
// ============================================================

/**
 * Gọi /models để kiểm tra key.
 * @returns {Promise<{ok: boolean, models: string[], error?: string}>}
 */
export async function verifyKey(rawKey) {
  const url = `${GROQ.baseUrl}${GROQ.verifyPath}`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${rawKey}` },
      },
      LIMITS.MODEL_SCAN_TIMEOUT_MS
    );

    const body = await safeJson(res);
    assertOkResponse(res.status, body, url);

    const models = Array.isArray(body?.data)
      ? body.data.map((m) => m.id).filter(Boolean)
      : [];

    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error: err?.message || "Key không hợp lệ",
    };
  }
}

// ============================================================
// GỌI CHAT
// ============================================================

/**
 * @param {object} p
 * @param {string} p.rawKey
 * @param {string} p.model
 * @param {Array}  p.messages   - [{ role: "system"|"user"|"assistant", content }]
 * @param {number} [p.temperature]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 */
export async function chat({
  rawKey,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 2048,
  signal,
}) {
  const url = `${GROQ.baseUrl}/chat/completions`;

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  return withRetry(
    async () => {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rawKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal,
        },
        LIMITS.PROVIDER_TIMEOUT_MS
      );

      const body = await safeJson(res);
      assertOkResponse(res.status, body, url);

      const choice = body?.choices?.[0];
      const content = choice?.message?.content || "";

      return {
        ok: true,
        text: content,
        usage: body?.usage || null,
        model: body?.model || model,
      };
    },
    { signal }
  );
}

// ============================================================
// TIỆN ÍCH
// ============================================================

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  // Nếu caller truyền signal → kết hợp
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

export default { verifyKey, chat };