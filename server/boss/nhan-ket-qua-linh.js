// server/boss/nhan-ket-qua-linh.js
// Nhiệm vụ: BOSS nhận kết quả từ lính (thông qua Tiểu Não).
// Quy tắc dự án (PHẦN 01, mục 9):
//   - Lính sau khi làm xong phải đưa câu trả lời cho BOSS.

import { traKetQuaChoBoss } from "../tieu-nao/tra-ket-qua-cho-boss.js";
import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// NHẬN KẾT QUẢ
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.taskId
 * @returns {Promise<{ok: boolean, items: Array, merged?: string, error?: string}>}
 */
export async function nhanKetQuaLinh({ userId, conversationId, taskId }) {
  const res = await traKetQuaChoBoss({ taskId });

  if (!res.ok) {
    await logWarn("BOSS nhận kết quả lính: chưa đủ", {
      userId,
      conversationId,
      taskId,
      error: res.error,
    });
    return { ok: false, items: res.items, error: res.error };
  }

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.SOLDIER_DONE,
    WORK_STATUS.WAITING_BOSS
  );

  await logInfo("BOSS nhận kết quả lính", {
    userId,
    conversationId,
    taskId,
    count: res.items.length,
  });

  return {
    ok: true,
    items: res.items,
    merged: res.merged,
  };
}

export default { nhanKetQuaLinh };