// server/boss/nhan-ket-qua-linh.js
// Nhiệm vụ: BOSS nhận kết quả từ lính (qua Tiểu Não).

import { traKetQuaChoBoss } from "../tieu-nao/tra-ket-qua-cho-boss.js";
import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

export async function nhanKetQuaLinh({ userId, conversationId, taskId }) {
  const res = await traKetQuaChoBoss({ taskId });

  if (!res.ok) {
    await logWarn("BOSS nhận kết quả lính: chưa đủ", {
      userId,
      conversationId,
      taskId,
      failureCount: res.failures?.length || 0,
    });
    return {
      ok: false,
      items: res.items,
      failures: res.failures,
      error: res.error,
    };
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
    successCount: res.items.filter((i) => i.status === "done").length,
  });

  return {
    ok: true,
    items: res.items,
    merged: res.merged,
    failures: res.failures,
  };
}

export default { nhanKetQuaLinh };