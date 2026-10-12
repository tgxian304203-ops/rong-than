// server/boss/doc-lai-yeu-cau.js
// Nhiệm vụ: BOSS mới đọc lại yêu cầu User khi được gọi lên thay.
// Quy tắc dự án (PHẦN 01, mục 5):
//   - Khi BOSS hết quota hoặc lỗi → BOSS mới lên thay.
//   - BOSS mới PHẢI đọc lại yêu cầu User.

import { loadWorkState } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// ĐỌC LẠI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @returns {Promise<{ok: boolean, userRequest?: string, context?: object, error?: string}>}
 */
export async function docLaiYeuCau({ userId, conversationId }) {
  if (!userId || !conversationId) {
    return { ok: false, error: "Thiếu userId hoặc conversationId" };
  }

  const state = await loadWorkState(userId, conversationId);

  if (!state || !state.userRequest) {
    await logWarn("BOSS mới không đọc được yêu cầu User", {
      userId,
      conversationId,
    });
    return {
      ok: false,
      error: "Không tìm thấy yêu cầu gốc của User trong trạng thái",
    };
  }

  await logInfo("BOSS mới đọc lại yêu cầu User", {
    userId,
    conversationId,
    userRequestLength: state.userRequest.length,
  });

  return {
    ok: true,
    userRequest: state.userRequest,
    context: state.context || {},
  };
}

export default { docLaiYeuCau };