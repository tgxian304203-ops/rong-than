// src/utils/mask.js
// Nhiệm vụ: Che API Key khi hiển thị
// Quy tắc dự án:
//   - Groq:        gsk_••••
//   - Gemini:      AIza••••
//   - OpenRouter:  sk-or-••••
//   - Tavily/SerpJet/Brave: Key••••
// Không bao giờ hiển thị key đầy đủ.

const PROVIDER_PREFIXES = {
  groq: "gsk_",
  gemini: "AIza",
  openrouter: "sk-or-",
  tavily: "tvly-",
  serpjet: "sj-",
  brave: "BSA",
};

/**
 * Che API key khi hiển thị.
 * @param {string} key - API key gốc
 * @param {string} provider - tên nhà cung cấp (groq, gemini, openrouter, tavily, serpjet, brave)
 * @returns {string} key đã che, ví dụ "gsk_••••"
 */
export function maskKey(key, provider) {
  if (!key || typeof key !== "string") return "••••";

  const prefix = PROVIDER_PREFIXES[provider?.toLowerCase()] || "";

  if (prefix && key.startsWith(prefix)) {
    return `${prefix}••••`;
  }

  // Không nhận diện được prefix → che toàn bộ, chỉ giữ 4 ký tự đầu
  if (key.length <= 4) return "••••";
  return `${key.slice(0, 4)}••••`;
}

/**
 * Che key kiểu ngắn gọn, không cần biết provider.
 * @param {string} key
 * @returns {string}
 */
export function maskKeyShort(key) {
  if (!key || typeof key !== "string") return "••••";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * Che mật khẩu — luôn trả về chuỗi cố định, không lộ độ dài thật.
 * @returns {string}
 */
export function maskPassword() {
  return "••••••••";
}

/**
 * Che toàn bộ key trong chuỗi văn bản (dùng cho log).
 * Tìm các pattern key đã biết và thay bằng dấu •.
 * @param {string} text
 * @returns {string}
 */
export function maskKeysInText(text) {
  if (!text || typeof text !== "string") return text;

  let result = text;

  // Groq: gsk_...
  result = result.replace(/gsk_[A-Za-z0-9]{20,}/g, "gsk_••••");
  // Gemini: AIza...
  result = result.replace(/AIza[A-Za-z0-9_\-]{20,}/g, "AIza••••");
  // OpenRouter: sk-or-...
  result = result.replace(/sk-or-[A-Za-z0-9\-]{20,}/g, "sk-or-••••");
  // Tavily: tvly-...
  result = result.replace(/tvly-[A-Za-z0-9]{20,}/g, "tvly-••••");
  // Brave: BSA...
  result = result.replace(/BSA[A-Za-z0-9_\-]{20,}/g, "BSA••••");

  return result;
}

/**
 * Danh sách prefix để nhận diện provider từ key (dùng khi dò nhà cung cấp).
 */
export const KEY_PREFIX_MAP = { ...PROVIDER_PREFIXES };