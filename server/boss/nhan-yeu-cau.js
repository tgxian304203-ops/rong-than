// server/boss/nhan-yeu-cau.js
// Nhiệm vụ: BOSS nhận yêu cầu từ Rồng Thần.
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - Rồng Thần chuyển yêu cầu cho BOSS.
//   - BOSS phân tích, viết format, điều phối.

import { saveWorkState, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// NHẬN
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.userRequest
 * @param {string} [p.userLabel]   - nhãn phân loại từ Đại Não (nếu có)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function nhanYeuCau({
  userId,
  conversationId,
  userRequest,
  userLabel = null,
}) {
  if (!userRequest || !String(userRequest).trim()) {
    return { ok: false, error: "Yêu cầu rỗng" };
  }

  await saveWorkState({
    userId,
    conversationId,
    userRequest: String(userRequest).trim(),
    currentStep: WORK_STEP.RECEIVED,
    status: WORK_STATUS.IN_PROGRESS,
    context: { userLabel },
  });

  await logInfo("BOSS nhận yêu cầu", {
    userId,
    conversationId,
    userLabel,
  });

  return { ok: true };
}

export default { nhanYeuCau };