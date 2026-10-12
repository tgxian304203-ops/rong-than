// server/boss/viet-format.js
// Nhiệm vụ: BOSS viết format điều phối lính.
// Nhận analysis 3 tầng — goal, requirements, subtasks, risks.

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

  const taskType = analysis?.taskType || "bulk";

  // Xây dựng goal từ analysis chi tiết
  let goal = analysis?.goal || String(userRequest).trim();

  // Thêm requirements vào goal
  if (analysis?.requirements?.length > 0) {
    goal += `\n\nYêu cầu cụ thể:\n${analysis.requirements.map((r) => `- ${r}`).join("\n")}`;
  }

  // Thêm constraints
  const constraints = [...(analysis?.constraints || [])];

  // Thêm length + tone + audience
  if (analysis?.length) constraints.push(`Độ dài: ${analysis.length}`);
  if (analysis?.tone) constraints.push(`Phong cách: ${analysis.tone}`);
  if (analysis?.targetAudience) constraints.push(`Đối tượng: ${analysis.targetAudience}`);

  // Nếu là redo → thêm ngữ cảnh
  if (analysis?.isRedo && Array.isArray(history) && history.length > 0) {
    const recent = history
      .slice(-6)
      .map((m) => `[${m.role === "ai" ? "AI" : "User"}]: ${m.text}`)
      .join("\n");
    goal += `\n\n[Ngữ cảnh gần đây — đây là yêu cầu chỉnh sửa nội dung trước]\n${recent}`;
  }

  const format = {
    taskType,
    goal,
    input: webContext ? String(webContext) : "",
    constraints,
    expectedOutput: analysis?.expectedOutput || "",
    subtasks: analysis?.subtasks || [],
    risks: analysis?.risks || [],
    qualityCriteria: analysis?.qualityCriteria || [],
    context: {
      needWeb: !!analysis?.needWeb,
      needCode: !!analysis?.needCode,
      rawLength: analysis?.rawLength || 0,
      isRedo: !!analysis?.isRedo,
      inheritedTaskType: analysis?.inheritedTaskType || null,
      matchesUserIntent: analysis?.matchesUserIntent !== false,
      missingRequirements: analysis?.missingRequirements || [],
      suggestions: analysis?.suggestions || [],
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
    isRedo: analysis?.isRedo,
    subtaskCount: format.subtasks.length,
    constraintCount: constraints.length,
  });

  return { ok: true, format };
}

export default { vietFormat };