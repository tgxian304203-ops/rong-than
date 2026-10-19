// server/providers/openrouter.js
// Nhiệm vụ: Kết nối OpenRouter.
// Hỗ trợ Native Tool Calling.

import { MODEL_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";
import { withRetry, assertOkResponse } from "./retry.js";

const OPENROUTER = MODEL_PROVIDERS.openrouter;

// ============================================================
// KIỂM TRA KEY
// ============================================================
export async function verifyKey(rawKey) {
  const url = `${OPENROUTER.baseUrl}${OPENROUTER.verifyPath}`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET", headers: { Authorization: `Bearer ${rawKey}` } }, LIMITS.MODEL_SCAN_TIMEOUT_MS);
    const body = await safeJson(res);
    assertOkResponse(res.status, body, url);
    const models = Array.isArray(body?.data) ? body.data.map((m) => m.id).filter(Boolean) : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: err?.message || "Key không hợp lệ" };
  }
}

// ============================================================
// GỌI CHAT (HỖ TRỢ TOOLS)
// ============================================================
export async function chat({ rawKey, model, messages, temperature = 0.7, maxTokens = 2048, tools, signal }) {
  const url = `${OPENROUTER.baseUrl}/chat/completions`;

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  // Chuyển đổi tools sang chuẩn OpenAI
  if (tools && tools.length > 0) {
    payload.tools = tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  return withRetry(
    async () => {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rawKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://rong-than.app",
            "X-Title": "Rong Than",
          },
          body: JSON.stringify(payload),
          signal,
        },
        LIMITS.PROVIDER_TIMEOUT_MS
      );

      const body = await safeJson(res);
      assertOkResponse(res.status, body, url);

      const choice = body?.choices?.[0];
      const message = choice?.message || {};
      
      let toolCalls = null;
      if (message.tool_calls && message.tool_calls.length > 0) {
        toolCalls = message.tool_calls.map(tc => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || "{}")
        }));
      }

      return {
        ok: true,
        text: message.content || "",
        toolCalls,
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
  if (options.signal) options.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try { return await fetch(url, { ...options, signal: ctrl.signal }); } finally { clearTimeout(id); }
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

export default { verifyKey, chat };