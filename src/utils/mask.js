// src/utils/mask.js
// Nhiệm vụ: Che API Key khi hiển thị.
// Hỗ trợ Gemini cả prefix "AIza" (cũ) và "AQ." (mới).

const PROVIDER_PREFIXES = {
  groq: ["gsk_"],
  gemini: ["AIza", "AQ."],
  openrouter: ["sk-or-"],
  tavily: ["tvly-"],
  serpjet: ["sj-"],
  brave: ["BSA"],
};

function getPrefixes(provider) {
  if (!provider) return [];
  const list = PROVIDER_PREFIXES[provider.toLowerCase()];
  if (!list) return [];
  return Array.isArray(list) ? list : [list];
}

/**
 * Che API key khi hiển thị.
 */
export function maskKey(key, provider) {
  if (!key || typeof key !== "string") return "••••";

  const prefixes = getPrefixes(provider);
  for (const p of prefixes) {
    if (key.startsWith(p)) return `${p}••••`;
  }

  if (key.length <= 4) return "••••";
  return `${key.slice(0, 4)}••••`;
}

export function maskKeyShort(key) {
  if (!key || typeof key !== "string") return "••••";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function maskPassword() {
  return "••••••••";
}

export function maskKeysInText(text) {
  if (!text || typeof text !== "string") return text;

  let result = text;

  result = result.replace(/gsk_[A-Za-z0-9]{20,}/g, "gsk_••••");
  // Gemini cũ
  result = result.replace(/AIza[A-Za-z0-9_\-]{20,}/g, "AIza••••");
  // Gemini mới
  result = result.replace(/AQ\.[A-Za-z0-9_\-\.]{20,}/g, "AQ.••••");
  result = result.replace(/sk-or-[A-Za-z0-9\-]{20,}/g, "sk-or-••••");
  result = result.replace(/tvly-[A-Za-z0-9]{20,}/g, "tvly-••••");
  result = result.replace(/BSA[A-Za-z0-9_\-]{20,}/g, "BSA••••");

  return result;
}

export const KEY_PREFIX_MAP = { ...PROVIDER_PREFIXES };