// server/web/chay-tim-kiem.js
// Nhiệm vụ: Chạy tìm kiếm Web từ key nhóm Web.
// Đặc điểm:
//   - Xoay key theo vòng lặp khi hết quota (đủ vòng, không bỏ qua).
//   - Chuyển provider khi 1 provider hết sạch key.
//   - Ghi lại lịch sử tìm kiếm (webSearchRuns).

import {
  WEB_PROVIDER_IDS,
  WEB_PROVIDERS,
} from "../config/providers.js";
import { LIMITS } from "../config/limits.js";
import { listKeysByProvider, updateQuota } from "../db/webKeys.js";
import { saveRun } from "../db/webSearchRuns.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import tavily from "./tavily.js";
import serpjet from "./serpjet.js";
import brave from "./brave.js";

// ============================================================
// MAP PROVIDER → MODULE
// ============================================================

const MODULES = {
  tavily,
  serpjet,
  brave,
};

// ============================================================
// CHẠY TÌM KIẾM
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.query
 * @param {number} [p.maxResults]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, results: Array, provider?: string, error?: string}>}
 */
export async function chayTimKiem({
  userId,
  conversationId,
  query,
  maxResults = 5,
  signal,
}) {
  if (!query || !String(query).trim()) {
    return { ok: false, results: [], error: "Query rỗng" };
  }

  const errors = [];

  // Duyệt lần lượt từng provider (theo thứ tự trong WEB_PROVIDER_IDS)
  for (const providerId of WEB_PROVIDER_IDS) {
    const providerCfg = WEB_PROVIDERS[providerId];
    const mod = MODULES[providerId];
    if (!mod) continue;

    // Lấy danh sách key của provider này
    let keys = [];
    try {
      keys = await listKeysByProvider(userId, providerId);
    } catch (err) {
      errors.push(`[${providerId}] không đọc được key: ${err?.message || err}`);
      continue;
    }

    if (!keys || keys.length === 0) {
      errors.push(`[${providerId}] chưa có key nào`);
      continue;
    }

    // Xoay key đủ vòng
    const tried = new Set();
    for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
      let anyAvailable = false;

      for (const key of keys) {
        if (tried.has(String(key._id))) continue;
        if (key.quota === "out") continue;

        anyAvailable = true;
        tried.add(String(key._id));

        const result = await mod.search({
          rawKey: key.rawKey,
          query: String(query).trim(),
          maxResults,
          signal,
        });

        if (result.ok) {
          // Ghi lịch sử
          try {
            await saveRun({
              userId,
              conversationId,
              provider: providerId,
              query: String(query).trim(),
              results: result.results,
              status: "success",
            });
          } catch {
            /* bỏ qua lỗi ghi lịch sử */
          }

          await logInfo(`Web search OK qua ${providerId}`, {
            userId,
            provider: providerId,
          });

          return {
            ok: true,
            results: result.results,
            provider: providerId,
          };
        }

        // Lỗi → kiểm tra xem có phải hết quota / key sai không
        const errMsg = String(result.error || "").toLowerCase();
        const isQuota =
          errMsg.includes("quota") ||
          errMsg.includes("exceed") ||
          errMsg.includes("rate") ||
          errMsg.includes("429");
        const isKeyErr =
          errMsg.includes("invalid") ||
          errMsg.includes("unauthor") ||
          errMsg.includes("401") ||
          errMsg.includes("403");

        if (isQuota || isKeyErr) {
          try {
            await updateQuota(key._id, "out");
          } catch {
            /* bỏ qua */
          }
          await logWarn(`Key ${providerId} hết quota / sai`, {
            userId,
            provider: providerId,
            keyId: String(key._id),
          });
          continue;
        }

        // Lỗi khác → ghi nhận, thử key khác
        errors.push(`[${providerId}] ${result.error || "lỗi không rõ"}`);
      }

      if (!anyAvailable) break; // hết key khả dụng → sang provider khác
    }
  }

  // Không provider nào chạy được
  try {
    await saveRun({
      userId,
      conversationId,
      provider: "all",
      query: String(query).trim(),
      results: [],
      status: "error",
      error: errors.join(" | ") || "Không có provider nào dùng được",
    });
  } catch {
    /* bỏ qua */
  }

  return {
    ok: false,
    results: [],
    error: errors.join(" | ") || "Không có provider nào dùng được",
  };
}

export default { chayTimKiem };