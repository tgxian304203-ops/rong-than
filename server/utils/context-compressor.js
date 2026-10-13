// server/utils/context-compressor.js
// Nhiệm vụ: Nén ngữ cảnh hội thoại.
// QUY TẮC:
//   - Luôn gửi 10 tin cuối.
//   - Gửi TẤT CẢ tin có keyword liên quan.
//   - Bỏ tin không liên quan.
//   - Nếu vẫn > 100k tokens → chia nhỏ lịch sử.

import { LIMITS } from "../config/limits.js";
import { countMessagesTokens, countTokens } from "./token-counter.js";
import { chunkArrayByTokens } from "./chunker.js";

// ============================================================
// TỪ DỪNG TIẾNG VIỆT + ANH
// ============================================================

const STOP_WORDS = new Set([
  // Tiếng Việt
  "và", "của", "là", "thì", "mà", "cho", "với", "các", "một",
  "những", "được", "có", "không", "này", "khi", "để", "từ", "trong",
  "ra", "vào", "lên", "xuống", "rồi", "đã", "đang", "sẽ", "hãy",
  "hộ", "giúp", "tôi", "mình", "bạn", "anh", "chị", "em", "nó",
  "vậy", "thế", "sao", "gì", "nào", "đâu", "ai", "như", "ở", "ạ",
  "vâng", "ừ", "uh", "ok", "okay",
  // Tiếng Anh
  "the", "a", "an", "of", "to", "for", "with", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "being", "in", "on",
  "at", "by", "this", "that", "these", "those", "it", "its",
]);

// ============================================================
// TRÍCH KEYWORD
// ============================================================

/**
 * Trích keyword chính từ 1 chuỗi.
 * @param {string} text
 * @returns {Set<string>}
 */
export function extractKeywords(text) {
  if (typeof text !== "string") return new Set();

  // Chuẩn hóa: lowercase, bỏ dấu câu
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter((w) => w.length >= 2);
  const keywords = new Set();

  for (const w of words) {
    if (!STOP_WORDS.has(w)) keywords.add(w);
  }

  return keywords;
}

// ============================================================
// CHẤM ĐIỂM TIN NHẮN
// ============================================================

/**
 * Chấm điểm 1 tin dựa trên keyword + vị trí + taskType.
 * @param {object} msg
 * @param {Set<string>} keywords
 * @param {number} indexInHistory
 * @param {number} totalHistory
 * @param {string} [taskType]
 * @returns {number}
 */
function scoreMessage(msg, keywords, indexInHistory, totalHistory, taskType) {
  let score = 0;

  const text = String(msg?.text || "").toLowerCase();
  const msgKeywords = extractKeywords(text);

  // +10 điểm cho mỗi keyword trùng
  for (const k of keywords) {
    if (msgKeywords.has(k)) {
      score += 10;
    } else if (text.includes(k)) {
      // Trường hợp keyword nằm trong cụm
      score += 5;
    }
  }

  // +5 điểm nếu là 10 tin cuối
  const fromEnd = totalHistory - 1 - indexInHistory;
  if (fromEnd < 10) score += 5;

  // +3 điểm nếu cùng taskType
  if (taskType && msg?.meta?.analysis?.taskType === taskType) {
    score += 3;
  }

  return score;
}

// ============================================================
// NÉN NGỮ CẢNH
// ============================================================

/**
 * Nén ngữ cảnh hội thoại.
 * @param {object} p
 * @param {Array} p.history      — tất cả tin (đã đọc từ DB, cũ → mới)
 * @param {string} p.userRequest — yêu cầu hiện tại
 * @param {string} [p.taskType]  — loại nhiệm vụ (để boost tin cùng loại)
 * @param {number} [p.maxTokens] — ngưỡng token tối đa
 * @returns {{ messages: Array, groups: Array[], compressed: boolean }}
 *          messages: mảng tin đã nén (nếu không cần chia)
 *          groups: nếu lịch sử > maxTokens → chia thành nhiều nhóm
 */
export function compressContext({
  history,
  userRequest,
  taskType = null,
  maxTokens = LIMITS.CONTEXT_TOKEN_GEMINI_MAX,
}) {
  if (!Array.isArray(history) || history.length === 0) {
    return { messages: [], groups: [], compressed: false };
  }

  const keywords = extractKeywords(userRequest);

  // Chấm điểm từng tin
  const scored = history.map((msg, idx) => ({
    msg,
    score: scoreMessage(msg, keywords, idx, history.length, taskType),
    idx,
  }));

  // Luôn giữ 10 tin cuối
  const total = history.length;
  const lastIndexes = new Set();
  for (let i = Math.max(0, total - 10); i < total; i++) {
    lastIndexes.add(i);
  }

  // Lọc: giữ tin score > 0 HOẶC nằm trong 10 tin cuối
  const kept = scored.filter(
    (s) => s.score > 0 || lastIndexes.has(s.idx)
  );

  // Sắp xếp lại theo thứ tự gốc
  kept.sort((a, b) => a.idx - b.idx);

  const messages = kept.map((s) => ({
    role: s.msg.role === "ai" ? "assistant" : "user",
    content: String(s.msg.text || ""),
    _origIndex: s.idx,
  }));

  // Đếm token
  const tokens = countMessagesTokens(messages);

  // Nếu <= maxTokens → trả về luôn
  if (tokens <= maxTokens) {
    return { messages, groups: [], compressed: true };
  }

  // Nếu > maxTokens → chia nhỏ lịch sử
  const groups = chunkArrayByTokens(messages, maxTokens);

  return { messages: [], groups, compressed: true };
}

// ============================================================
// NÉN TIN THEO NGƯỠNG CỤ THỂ
// ============================================================

/**
 * Nén lịch sử xuống <= maxTokens.
 * Giữ 10 tin cuối + tin liên quan. Bỏ dần tin score thấp.
 *
 * @param {Array} history
 * @param {string} userRequest
 * @param {number} maxTokens
 * @returns {Array}
 */
export function compressToLimit(history, userRequest, maxTokens) {
  const result = compressContext({ history, userRequest, maxTokens });
  return result.messages;
}

export default {
  extractKeywords,
  compressContext,
  compressToLimit,
};