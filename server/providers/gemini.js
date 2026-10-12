// server/providers/gemini.js
// Nhiệm vụ: Kết nối Gemini (Google Generative Language API).

import { MODEL_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";
import { withRetry, assertOkResponse } from "./retry.js";

const GEMINI = MODEL_PROVIDERS.gemini;

// ============================================================
// KIỂM TRA KEY
// ============================================================

export async function verifyKey(rawKey) {
  const url = `${GEMINI.baseUrl}${GEMINI.verifyPath}?key=${encodeURIComponent(
    rawKey
  )}`;

  try {
    const res = await fetchWithTimeout(
      url,
      { method: "GET" },
      LIMITS.MODEL_SCAN_TIMEOUT_MS
    );

    const body = await safeJson(res);
    assertOkResponse(res.status, body, url);

    const models = Array.isArray(body?.models)
      ? body.models
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter(Boolean)
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
 * Gemini dùng format contents khác OpenAI.
 * Ta map messages → contents.
 */
export async function chat({
  rawKey,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 2048,
  signal,
}) {
  const url = `${GEMINI.baseUrl}/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(rawKey)}`;

  const { contents, systemInstruction } = mapMessages(messages);

  const payload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  return withRetry(
    async () => {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        },
        LIMITS.PROVIDER_TIMEOUT_MS
      );

      const body = await safeJson(res);
      assertOkResponse(res.status, body, url);

      const parts = body?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p?.text || "").join("");

      return {
        ok: true,
        text,
        usage: body?.usageMetadata || null,
        model,
      };
    },
    { signal }
  );
}

// ============================================================
// MAP MESSAGES
// ============================================================

function mapMessages(messages) {
  let systemInstruction = "";
  const contents = [];

  for (const m of messages || []) {
    const role = m?.role;
    const content = String(m?.content ?? "");
    if (!content) continue;

    if (role === "system") {
      systemInstruction += (systemInstruction ? "\n\n" : "") + content;
      continue;
    }

    contents.push({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    });
  }

  return { contents, systemInstruction };
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

export default { verifyKey, chat };