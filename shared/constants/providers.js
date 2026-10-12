// shared/constants/providers.js
// Nhiệm vụ: Hằng số nhà cung cấp model.
// Hỗ trợ cả 2 prefix của Gemini:
//   - "AIza" — key cũ
//   - "AQ."  — key mới (auth key, từ 28/05/2026)

export const MODEL_PROVIDERS = {
  groq: {
    id: "groq",
    name: "Groq",
    prefix: "gsk_",
    baseUrl: "https://api.groq.com/openai/v1",
    verifyPath: "/models",
    modelsPath: "data",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    prefixes: ["AIza", "AQ."],
    prefix: "AIza", // giữ để tương thích code cũ
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    verifyPath: "/models",
    modelsPath: "models",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    prefix: "sk-or-",
    baseUrl: "https://openrouter.ai/api/v1",
    verifyPath: "/models",
    modelsPath: "data",
  },
};

export const MODEL_PROVIDER_IDS = Object.keys(MODEL_PROVIDERS);

export function getModelProvider(id) {
  return MODEL_PROVIDERS[id] || null;
}

/**
 * Kiểm tra key có khớp prefix của provider không.
 * Hỗ trợ cả trường hợp provider có 1 prefix (string) hoặc nhiều (array).
 */
export function keyMatchesProvider(key, providerId) {
  if (!key || typeof key !== "string") return false;
  const p = MODEL_PROVIDERS[providerId];
  if (!p) return false;
  const list = Array.isArray(p.prefixes) ? p.prefixes : [p.prefix];
  return list.some((prefix) => key.startsWith(prefix));
}

export function detectModelProviderByPrefix(key) {
  if (!key || typeof key !== "string") return null;
  for (const id of MODEL_PROVIDER_IDS) {
    const p = MODEL_PROVIDERS[id];
    const list = Array.isArray(p.prefixes) ? p.prefixes : [p.prefix];
    if (list.some((prefix) => key.startsWith(prefix))) return id;
  }
  return null;
}

export default {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_IDS,
  getModelProvider,
  keyMatchesProvider,
  detectModelProviderByPrefix,
};