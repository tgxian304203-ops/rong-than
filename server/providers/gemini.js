// server/providers/gemini.js
// Nhiệm vụ: Kết nối Gemini (Google Generative Language API).
// Hỗ trợ Native Tool Calling.

import { MODEL_PROVIDERS } from "../config/providers.js";
import { LIMITS } from "../config/limits.js";
import { withRetry, assertOkResponse } from "./retry.js";

const GEMINI = MODEL_PROVIDERS.gemini;

// ============================================================
// KIỂM TRA KEY
// ============================================================
export async function verifyKey(rawKey) {
  const url = `${GEMINI.baseUrl}${GEMINI.verifyPath}?key=${encodeURIComponent(rawKey)}`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET" }, LIMITS.MODEL_SCAN_TIMEOUT_MS);
    const body = await safeJson(res);
    assertOkResponse(res.status, body, url);
    const models = Array.isArray(body?.models) ? body.models.map((m) => String(m.name || "").replace(/^models\//, "")).filter(Boolean) : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: err?.message || "Key không hợp lệ" };
  }
}

// ============================================================
// GỌI CHAT (HỖ TRỢ TOOLS)
// ============================================================
export async function chat({ rawKey, model, messages, temperature = 0.7, maxTokens = 2048, tools, signal }) {
  const url = `${GEMINI.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(rawKey)}`;

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

  // Chuyển đổi tools sang chuẩn của Gemini (Type phải viết HOA)
  if (tools && tools.length > 0) {
    payload.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: "OBJECT",
          properties: Object.fromEntries(
            Object.entries(t.parameters.properties || {}).map(([k, v]) => [
              k, { type: v.type.toUpperCase(), description: v.description }
            ])
          ),
          required: t.parameters.required || []
        }
      }))
    }];
  }

  return withRetry(
    async () => {
      const res = await fetchWithTimeout(
        url,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal },
        LIMITS.PROVIDER_TIMEOUT_MS
      );

      const body = await safeJson(res);
      assertOkResponse(res.status, body, url);

      const parts = body?.candidates?.[0]?.content?.parts || [];
      
      let text = "";
      let toolCalls = [];

      // Đọc Text và Function Call
      for (const part of parts) {
        if (part.text) text += part.text;
        if (part.functionCall) {
          toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
        }
      }

      return {
        ok: true,
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
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

    const mappedRole = role === "assistant" ? "model" : "user";
    const lastContent = contents[contents.length - 1];
    
    if (lastContent && lastContent.role === mappedRole) {
      lastContent.parts[0].text += "\n\n" + content;
    } else {
      contents.push({ role: mappedRole, parts: [{ text: content }] });
    }
  }

  if (contents.length > 0 && contents[0].role === "model") contents.shift();
  return { contents, systemInstruction };
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