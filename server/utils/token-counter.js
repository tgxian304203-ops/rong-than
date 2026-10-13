// server/utils/token-counter.js
// Nhiệm vụ: Đếm token ƯỚC TÍNH (không cần thư viện).
// Công thức: 1 token ≈ 4 ký tự (tiếng Anh). Với tiếng Việt
// có dấu → ước tính 1 token ≈ 3 ký tự để an toàn hơn.

import { LIMITS } from "../config/limits.js";

const CHARS_PER_TOKEN = LIMITS.TOKEN_ESTIMATE_CHARS_PER_TOKEN || 4;

// ============================================================
// ĐẾM TOKEN
// ============================================================

/**
 * Đếm token ước tính của 1 chuỗi.
 * @param {string} text
 * @returns {number}
 */
export function countTokens(text) {
  if (typeof text !== "string" || !text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Đếm token ước tính của 1 mảng messages.
 * @param {Array} messages
 * @returns {number}
 */
export function countMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    if (!m) continue;
    const content = String(m.content || m.text || "");
    total += countTokens(content);
    // overhead cho role, metadata
    total += 4;
  }
  return total;
}

/**
 * Đếm token của toàn bộ object (JSON stringify).
 * @param {any} obj
 * @returns {number}
 */
export function countObjectTokens(obj) {
  try {
    return countTokens(JSON.stringify(obj));
  } catch {
    return 0;
  }
}

// ============================================================
// SO SÁNH NGƯỠNG
// ============================================================

/**
 * Xác định model nên dùng dựa vào số token.
 * @param {number} tokens
 * @returns {"groq"|"gemini"|"chunk"}
 */
export function pickStrategy(tokens) {
  if (tokens <= LIMITS.CONTEXT_TOKEN_GROQ_MAX) return "groq";
  if (tokens <= LIMITS.CONTEXT_TOKEN_GEMINI_MAX) return "gemini";
  return "chunk";
}

export default {
  countTokens,
  countMessagesTokens,
  countObjectTokens,
  pickStrategy,
};