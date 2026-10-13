// server/utils/chunker.js
// Nhiệm vụ: Chia nhỏ văn bản / mảng thành nhiều phần theo token.

import { LIMITS } from "../config/limits.js";
import { countTokens } from "./token-counter.js";

const CHARS_PER_TOKEN = LIMITS.TOKEN_ESTIMATE_CHARS_PER_TOKEN || 4;
const CHUNK_CHAR_SIZE = LIMITS.CHUNK_TOKEN_SIZE * CHARS_PER_TOKEN;

// ============================================================
// CHIA CHUỖI
// ============================================================

/**
 * Chia 1 chuỗi dài thành nhiều phần ~CHUNK_CHAR_SIZE ký tự.
 * Ưu tiên cắt theo dấu xuống dòng (\n) hoặc dấu câu.
 *
 * @param {string} text
 * @param {number} [chunkCharSize]
 * @returns {string[]}
 */
export function chunkText(text, chunkCharSize = CHUNK_CHAR_SIZE) {
  if (typeof text !== "string") return [];
  if (text.length <= chunkCharSize) return [text];

  const chunks = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(cursor + chunkCharSize, text.length);

    // Nếu chưa tới cuối → tìm điểm cắt tự nhiên gần end
    if (end < text.length) {
      const window = text.slice(cursor, end);

      // Ưu tiên cắt tại \n\n (đoạn văn) — tìm ngược
      let cut = window.lastIndexOf("\n\n");
      if (cut < window.length * 0.5) {
        // Tìm \n đơn
        cut = window.lastIndexOf("\n");
      }
      if (cut < window.length * 0.5) {
        // Tìm dấu câu: . ? !
        cut = Math.max(
          window.lastIndexOf(". "),
          window.lastIndexOf("? "),
          window.lastIndexOf("! ")
        );
        if (cut > 0) cut += 1; // giữ dấu câu
      }
      if (cut < window.length * 0.5) {
        // Không tìm được → cắt cứng tại end
        cut = window.length;
      }

      end = cursor + cut;
    }

    chunks.push(text.slice(cursor, end));
    cursor = end;
  }

  return chunks;
}

// ============================================================
// CHIA MẢNG THEO TOKEN
// ============================================================

/**
 * Chia mảng messages thành nhiều nhóm — mỗi nhóm
 * có tổng token <= maxTokensPerGroup.
 *
 * @param {Array} items
 * @param {number} maxTokensPerGroup
 * @param {function} [getText] — hàm lấy text từ item
 * @returns {Array[]}
 */
export function chunkArrayByTokens(items, maxTokensPerGroup, getText = null) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const groups = [];
  let current = [];
  let currentTokens = 0;

  const textOf = getText || ((it) => String(it?.content || it?.text || ""));

  for (const item of items) {
    const t = countTokens(textOf(item)) + 4;

    if (currentTokens + t > maxTokensPerGroup && current.length > 0) {
      groups.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(item);
    currentTokens += t;
  }

  if (current.length > 0) groups.push(current);

  return groups;
}

export default {
  chunkText,
  chunkArrayByTokens,
};