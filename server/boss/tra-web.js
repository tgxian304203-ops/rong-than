// server/boss/tra-web.js
// Nhiệm vụ: BOSS tự tra Web từ key dán ở phần giao diện dán key Web.
// Quy tắc dự án (PHẦN 01, mục 4, 15):
//   - BOSS có quyền quyết định truy cập Web.
//   - Nếu là thông tin cần tra web thì BOSS sẽ tự làm.
//   - Không dùng key Đại Não/Tiểu Não cho Web.

import { chayTimKiem } from "../web/chay-tim-kiem.js";
import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// TRA WEB
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.query
 * @param {number} [p.maxResults]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, results: Array, provider?: string, summary?: string, error?: string}>}
 */
export async function traWeb({
  userId,
  conversationId,
  query,
  maxResults = 5,
  signal,
}) {
  if (!query || !String(query).trim()) {
    return { ok: false, results: [], error: "Query rỗng" };
  }

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.NEED_WEB,
    WORK_STATUS.IN_PROGRESS
  );

  const res = await chayTimKiem({
    userId,
    conversationId,
    query: String(query).trim(),
    maxResults,
    signal,
  });

  if (!res.ok) {
    return { ok: false, results: [], error: res.error };
  }

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.WEB_DONE,
    WORK_STATUS.IN_PROGRESS
  );

  await logInfo("BOSS tra Web xong", {
    userId,
    conversationId,
    provider: res.provider,
    count: res.results.length,
  });

  return {
    ok: true,
    results: res.results,
    provider: res.provider,
  };
}

// ============================================================
// GỘP KẾT QUẢ WEB THÀNH 1 KHỐI VĂN BẢN
// ============================================================

/**
 * Dùng để nhét vào prompt cho lính hoặc BOSS tự đọc.
 * @param {Array} results
 * @returns {string}
 */
export function formatWebResults(results) {
  if (!Array.isArray(results) || results.length === 0) return "";

  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`.trim()
    )
    .join("\n\n");
}

export default {
  traWeb,
  formatWebResults,
};