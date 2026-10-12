// server/boss/viet-format.js
// Nhiệm vụ: BOSS viết format điều phối lính.
// Nếu là "làm lại" → kế thừa taskType + thêm ngữ cảnh vào goal.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

export async function vietFormat({
  userId,
  conversationId,
  userRequest,
  analysis = null,
  webContext = "",
  history = [],
}) {
  if (!userRequest) {
    return { ok: false, format: null, error: "Thiếu yêu cầu" };
  }

  const taskType = analysis?.estimatedTaskType || "bulk";
  const isRedo = !!analysis?.isRedo;

  // Nếu là "làm lại" → gắn thêm ngữ cảnh gần đây vào goal
  let goal = String(userRequest).trim();
  if (isRedo && Array.isArray(history) && history.length > 0) {
    const recent = history
      .slice(-6)
      .map((m) => `[${m.role === "ai" ? "AI" : "User"}]: ${m.text}`)
      .join("\n");
    goal = `${goal}\n\n[Ngữ cảnh gần đây — đây là yêu cầu chỉnh sửa nội dung trước đó]\n${recent}`;
  }

  const format = {
    taskType,
    goal,
    input: webContext ? String(webContext) : "",
    constraints: [],
    expectedOutput: "",
    context: {
      needWeb: !!analysis?.needWeb,
      needCode: !!analysis?.needCode,
      rawLength: analysis?.rawLength || 0,
      isRedo,
      inheritedTaskType: analysis?.inheritedTaskType || null,
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
    isRedo,
  });

  return { ok: true, format };
}

export default { vietFormat };