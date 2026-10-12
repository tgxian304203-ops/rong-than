// server/config/providers.js
// Nhiệm vụ: Cấu hình danh sách nhà cung cấp model và web.
// Hỗ trợ Gemini cả prefix "AIza" (cũ) và "AQ." (mới).

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
    prefix: "AIza",
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

export const WEB_PROVIDERS = {
  tavily: {
    id: "tavily",
    name: "Tavily",
    prefix: "tvly-",
    baseUrl: "https://api.tavily.com",
    verifyPath: "/search",
    verifyMethod: "POST",
  },
  serpjet: {
    id: "serpjet",
    name: "SerpJet",
    prefix: "sj-",
    baseUrl: "https://api.serpjet.com",
    verifyPath: "/search",
    verifyMethod: "GET",
  },
  brave: {
    id: "brave",
    name: "Brave Search",
    prefix: "BSA",
    baseUrl: "https://api.search.brave.com/res/v1",
    verifyPath: "/web/search",
    verifyMethod: "GET",
  },
};

export const WEB_PROVIDER_IDS = Object.keys(WEB_PROVIDERS);

export function getModelProvider(id) {
  return MODEL_PROVIDERS[id] || null;
}

export function getWebProvider(id) {
  return WEB_PROVIDERS[id] || null;
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

export function detectWebProviderByPrefix(key) {
  if (!key || typeof key !== "string") return null;
  for (const id of WEB_PROVIDER_IDS) {
    const p = WEB_PROVIDERS[id];
    const list = Array.isArray(p.prefixes) ? p.prefixes : [p.prefix];
    if (list.some((prefix) => key.startsWith(prefix))) return id;
  }
  return null;
}