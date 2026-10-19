// server/providers/gemini.js
// Nhiệm vụ: Kết nối Gemini (Google Generative Language API).
// Đã sửa lỗi convert Tool Schema và mapMessages.

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
    const res = await fetchWithTimeout(
      url,
      { method: "GET" },
      LIMITS.MODEL_SCAN_TIMEOUT_MS
    );
    const body = await safeJson(res);
    assertOkResponse(res.status, body, url);
    const models = Array.isArray(body?.models)
      ? body.models.map((m) => String(m.name || "").replace(/^models\//, "")).filter(Boolean)
      : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: err?.message || "Key không hợp lệ" };
  }
}

// ============================================================
// HELPER: CONVERT SCHEMA SANG CHUẨN GEMINI (HỖ TRỢ ARRAY)
// ============================================================
function convertGeminiType(v) {
  if (!v || !v.type) return v;
  const result = { type: String(v.type).toUpperCase() };
  if (v.description) result.description = v.description;
  if (v.enum) result.enum = v.enum;
  if (v.required) result.required = v.required;
  if (v.items) result.items = convertGeminiType(v.items);
  if (v.properties) {
    result.properties = {};
    for (const [k, val] of Object.entries(v.properties)) {
      result.properties[k] = convertGeminiType(val);
    }
  }
  return result;
}

// ============================================================
// GỌI CHAT (HỖ TRỢ NATIVE TOOL CALLING)
// ============================================================
export async function chat({
  rawKey, model, messages, temperature = 0.7, maxTokens = 2048, tools, signal,
}) {
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

  if (tools && tools.length > 0) {
    payload.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: convertGeminiType(t.parameters)
      }))
    }];
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
      
      let text = "";
      let toolCalls = [];

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
// MAP MESSAGES (Gộp role trùng + bỏ tin đầu nếu là model)
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

  if (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }

  return { contents, systemInstruction };
}

// ============================================================
// TIỆN ÍCH
// ============================================================
async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  if (options.signal) options.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try { return await fetch(url, { ...options, signal: ctrl.signal }); } 
  finally { clearTimeout(id); }
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

export default { verifyKey, chat };