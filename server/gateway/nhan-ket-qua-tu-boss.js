// server/gateway/nhan-ket-qua-tu-boss.js
// Nhiệm vụ: Rồng Thần nhận kết quả cuối từ BOSS.
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - BOSS trả kết quả cho RỒNG THẦN.
//   - RỒNG THẦN trả kết quả cho User.

import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// NHẬN
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {object} p.bossResult   - { ok, text, meta }
 * @returns {Promise<{ok: boolean, text?: string, meta?: object, error?: string}>}
 */
export async function nhanKetQuaTuBoss({
  userId,
  conversationId,
  bossResult,
}) {
  if (!bossResult || typeof bossResult !== "object") {
    await logWarn("Rồng Thần nhận kết quả rỗng từ BOSS", {
      userId,
      conversationId,
    });
    return { ok: false, error: "BOSS không trả về kết quả" };
  }

  if (!bossResult.ok) {
    return {
      ok: false,
      error: bossResult.error || "BOSS báo lỗi",
    };
  }

  if (!bossResult.text || !String(bossResult.text).trim()) {
    return { ok: false, error: "BOSS trả về nội dung rỗng" };
  }

  await logInfo("Rồng Thần nhận kết quả từ BOSS", {
    userId,
    conversationId,
    textLength: String(bossResult.text).length,
  });

  return {
    ok: true,
    text: String(bossResult.text),
    meta: bossResult.meta || null,
  };
}

export default { nhanKetQuaTuBoss };