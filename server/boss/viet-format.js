// server/boss/viet-format.js
// Nhiệm vụ: BOSS viết format điều phối lính cho Tiểu Não.
// Quy tắc dự án (PHẦN 01, mục 3, 15):
//   - BOSS không trực tiếp làm yêu cầu mà viết format để điều phối lính.
//   - Format gồm: taskType, goal, input, constraints, expectedOutput, context.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// VIẾT FORMAT
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.userRequest
 * @param {object} [p.analysis]        - từ phan-tich-yeu-cau
 * @param {string} [p.webContext]      - chuỗi kết quả web (nếu có)
 * @returns {Promise<{ok: boolean, format: object, error?: string}>}
 */
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

  await logInfo("BOSS viết format điều phối lính", {
    userId,
    conversationId,
    taskType,
  });

  return { ok: true, format };
}

export default { vietFormat };