// server/boss/viet-format.js
// Nhiệm vụ: BOSS viết format điều phối lính cho Tiểu Não.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

export async function vietFormat({
  userId,
  conversationId,
  userRequest,
  analysis = null,
  webContext = "",
}) {
  if (!userRequest) {
    return { ok: false, format: null, error: "Thiếu yêu cầu" };
  }

  const taskType = analysis?.estimatedTaskType || "bulk";

  const format = {
    taskType,
    goal: String(userRequest).trim(),
    input: webContext ? String(webContext) : "",
    constraints: [],
    expectedOutput: "",
    context: {
      needWeb: !!analysis?.needWeb,
      needCode: !!analysis?.needCode,
      rawLength: analysis?.rawLength || 0,
    },
  };

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.FORMAT_WRITTEN,
    WORK_STATUS.WAITING_SOLDIER
  );

  await logInfo("BOSS: đã viết format điều phối lính", {
    userId,
    conversationId,
    taskType,
    needWeb: analysis?.needWeb,
    needCode: analysis?.needCode,
  });

  return { ok: true, format };
}

export default { vietFormat };