// shared/constants/providers.js
// Nhiệm vụ: Hằng số nhà cung cấp model.
// Khớp với đặc tả dự án:
//   - Model: Groq, Gemini, OpenRouter
//   - Prefix nhận diện key
//   - Base URL API
// KHÔNG tự đổi tên nhà cung cấp.

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

export function getModelProvider(id) {
  return MODEL_PROVIDERS[id] || null;
}

export function detectModelProviderByPrefix(key) {
  if (!key || typeof key !== "string") return null;
  for (const id of MODEL_PROVIDER_IDS) {
    if (key.startsWith(MODEL_PROVIDERS[id].prefix)) return id;
  }
  return null;
}

export default {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_IDS,
  getModelProvider,
  detectModelProviderByPrefix,
};