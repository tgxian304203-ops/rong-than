// server/boss/xac-dinh-tinh-trang.js
// Nhiệm vụ: BOSS mới xác định tình trạng hiện tại:
//   - Đang làm gì?
//   - Đã làm tới đâu?
// Quy tắc dự án (PHẦN 01, mục 5).

import { loadWorkState, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { listTasks, listSubTasks } from "../state/theo-doi-nhiem-vu.js";
import { listByConversation as listSandboxRuns } from "../db/sandboxRuns.js";
import { listByConversation as listArtifacts } from "../db/codeArtifacts.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// XÁC ĐỊNH
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @returns {Promise<{ok: boolean, tinhTrang: object, error?: string}>}
 */
export async function xacDinhTinhTrang({ userId, conversationId }) {
  if (!userId || !conversationId) {
    return { ok: false, error: "Thiếu userId hoặc conversationId" };
  }

  const state = await loadWorkState(userId, conversationId);
  if (!state) {
    await logWarn("BOSS mới không có trạng thái để xác định", {
      userId,
      conversationId,
    });
    return {
      ok: false,
      error: "Chưa có trạng thái công việc cho hội thoại này",
    };
  }

  // Tasks
  const tasks = await listTasks(conversationId);
  const latestTask = tasks[0] || null;

  // Subtasks của task gần nhất
  let subtasks = [];
  if (latestTask) {
    subtasks = await listSubTasks(String(latestTask._id));
  }

  // Sandbox runs
  const sandboxRuns = await listSandboxRuns(conversationId);
  const lastRun = sandboxRuns[0] || null;

  // Code artifacts
  const artifacts = await listArtifacts(conversationId);
  const latestArtifact = artifacts[0] || null;

  const tinhTrang = {
    currentStep: state.currentStep || WORK_STEP.RECEIVED,
    status: state.status || WORK_STATUS.PENDING,
    userRequest: state.userRequest || null,

    latestTask: latestTask
      ? {
          id: String(latestTask._id),
          taskType: latestTask.taskType,
          status: latestTask.status,
        }
      : null,

    subtasks: subtasks.map((s) => ({
      id: String(s._id),
      soldierModel: s.soldierModel,
      soldierProvider: s.soldierProvider,
      status: s.status,
    })),

    lastSandboxRun: lastRun
      ? {
          id: String(lastRun._id),
          status: lastRun.status,
          language: lastRun.language,
          durationMs: lastRun.durationMs,
        }
      : null,

    latestCode: latestArtifact
      ? {
          id: String(latestArtifact._id),
          version: latestArtifact.version,
          language: latestArtifact.language,
        }
      : null,
  };

  await logInfo("BOSS mới xác định tình trạng", {
    userId,
    conversationId,
    currentStep: tinhTrang.currentStep,
    status: tinhTrang.status,
  });

  return { ok: true, tinhTrang };
}

export default { xacDinhTinhTrang };