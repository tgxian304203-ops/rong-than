// server/dai-nao/ban-giao-trang-thai.js
// Nhiệm vụ: Bàn giao trạng thái cho BOSS mới.

import { loadWorkState, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { listTasks, listSubTasks } from "../state/theo-doi-nhiem-vu.js";
import { listByConversation as listRuns } from "../db/sandboxRuns.js";
import { listByConversation as listArtifacts } from "../db/codeArtifacts.js";
import { listByConversation as listWebRuns } from "../db/webSearchRuns.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// BÀN GIAO
// ============================================================

export async function banGiaoTrangThai({ userId, conversationId }) {
  try {
    const workState = await loadWorkState(userId, conversationId);
    const tasks = await listTasks(conversationId);

    let subtasks = [];
    if (tasks.length > 0) {
      const latestTask = tasks[0];
      subtasks = await listSubTasks(String(latestTask._id));
    }

    const sandboxRuns = await listRuns(conversationId);
    const artifacts = await listArtifacts(conversationId);
    const webRuns = await listWebRuns(conversationId);

    const handoff = {
      userRequest: workState?.userRequest || null,
      currentStep: workState?.currentStep || WORK_STEP.RECEIVED,
      status: workState?.status || WORK_STATUS.PENDING,
      context: workState?.context || {},

      taskInfo: {
        total: tasks.length,
        latestTask: tasks[0]
          ? {
              id: String(tasks[0]._id),
              taskType: tasks[0].taskType,
              status: tasks[0].status,
            }
          : null,
        subtasks: subtasks.map((s) => ({
          id: String(s._id),
          soldierModel: s.soldierModel,
          status: s.status,
        })),
      },

      sandbox: {
        totalRuns: sandboxRuns.length,
        lastRun: sandboxRuns[0]
          ? {
              id: String(sandboxRuns[0]._id),
              status: sandboxRuns[0].status,
              language: sandboxRuns[0].language,
              createdAt: sandboxRuns[0].createdAt,
            }
          : null,
      },

      code: {
        totalVersions: artifacts.length,
        latestVersion: artifacts[0]
          ? {
              id: String(artifacts[0]._id),
              version: artifacts[0].version,
              language: artifacts[0].language,
            }
          : null,
      },

      web: {
        totalRuns: webRuns.length,
        lastQuery: webRuns[0]?.query || null,
        lastProvider: webRuns[0]?.provider || null,
      },
    };

    await logInfo("Đại Não: bàn giao trạng thái cho BOSS mới", {
      userId,
      conversationId,
      currentStep: handoff.currentStep,
      status: handoff.status,
    });

    return { ok: true, handoff };
  } catch (err) {
    await logWarn("Đại Não: bàn giao trạng thái thất bại", {
      userId,
      conversationId,
      error: err?.message || String(err),
    });
    return {
      ok: false,
      handoff: null,
      error: err?.message || "Không đọc được trạng thái để bàn giao",
    };
  }
}

// ============================================================
// DỰNG MESSAGES BÀN GIAO
// ============================================================

export function buildHandoffPrompt(handoff) {
  if (!handoff) return "";

  const lines = [
    "[BÀN GIAO BOSS MỚI]",
    "BOSS cũ đã hết quota hoặc lỗi. Bạn là BOSS mới tiếp nhận.",
    "",
    "1. Yêu cầu gốc của User:",
    handoff.userRequest ? `"${handoff.userRequest}"` : "(chưa rõ)",
    "",
    "2. Tình trạng hiện tại:",
    `- Bước: ${handoff.currentStep}`,
    `- Trạng thái: ${handoff.status}`,
    "",
    "3. Nhiệm vụ đã giao:",
    `- Tổng số: ${handoff.taskInfo?.total ?? 0}`,
    handoff.taskInfo?.latestTask
      ? `- Task gần nhất: ${handoff.taskInfo.latestTask.taskType} (${handoff.taskInfo.latestTask.status})`
      : "- Chưa có task nào",
    `- Subtask (lính): ${handoff.taskInfo?.subtasks?.length ?? 0}`,
    "",
    "4. Sandbox:",
    `- Tổng lần chạy: ${handoff.sandbox?.totalRuns ?? 0}`,
    handoff.sandbox?.lastRun
      ? `- Lần cuối: ${handoff.sandbox.lastRun.status} (${handoff.sandbox.lastRun.language})`
      : "- Chưa chạy lần nào",
    "",
    "5. Code:",
    `- Tổng phiên bản: ${handoff.code?.totalVersions ?? 0}`,
    handoff.code?.latestVersion
      ? `- Bản mới nhất: v${handoff.code.latestVersion.version} (${handoff.code.latestVersion.language})`
      : "- Chưa có phiên bản nào",
    "",
    "6. Web:",
    `- Tổng lần tra: ${handoff.web?.totalRuns ?? 0}`,
    handoff.web?.lastQuery
      ? `- Truy vấn cuối: "${handoff.web.lastQuery}" qua ${handoff.web.lastProvider}`
      : "- Chưa tra web lần nào",
  ];

  if (handoff.context && Object.keys(handoff.context).length > 0) {
    lines.push("", "7. Ngữ cảnh bổ sung:");
    try {
      lines.push(JSON.stringify(handoff.context, null, 2));
    } catch {
      lines.push("(không đọc được)");
    }
  }

  lines.push(
    "",
    "Hãy đọc lại yêu cầu, xác định đang làm tới đâu, và TIẾP TỤC nhiệm vụ.",
    "Không làm lại từ đầu nếu không cần thiết."
  );

  return lines.join("\n");
}

export default {
  banGiaoTrangThai,
  buildHandoffPrompt,
};