// server/boss/tra-ket-qua.js
// Nhiệm vụ: BOSS trả kết quả cuối cho Rồng Thần.
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - BOSS trả kết quả cho Rồng Thần.
//   - Rồng Thần trả kết quả cho User.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// TRẢ KẾT QUẢ
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.text         - nội dung trả về User
 * @param {object} [p.meta]       - thông tin bổ sung (code, sandbox, web)
 * @returns {Promise<{ok: boolean, result?: object, error?: string}>}
 */
export async function traKetQua({ userId, conversationId, text, meta = null }) {
  if (!text || !String(text).trim()) {
    await logWarn("BOSS trả kết quả rỗng", { userId, conversationId });
    return { ok: false, error: "Không có nội dung để trả về User" };
  }

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.DELIVERED,
    WORK_STATUS.DONE
  );

  const result = {
    text: String(text),
    meta,
    deliveredAt: new Date().toISOString(),
  };

  await logInfo("BOSS trả kết quả cho Rồng Thần", {
    userId,
    conversationId,
    textLength: result.text.length,
  });

  return { ok: true, result };
}

export default { traKetQua };