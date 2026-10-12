// server/dai-nao/ban-giao-trang-thai.js
// Nhiệm vụ: Bàn giao trạng thái cho BOSS mới.
//
// Quy tắc dự án (PHẦN 01, mục 5):
//   - Khi BOSS hết quota hoặc lỗi → Đại Não gọi BOSS mới lên thay.
//   - BOSS mới phải đọc lại yêu cầu User.
//   - BOSS mới xác định tình trạng hiện tại đang làm gì, đã làm tới đâu.
//   - BOSS mới tiếp tục nhiệm vụ.

import { loadWorkState, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { listTasks, listSubTasks } from "../state/theo-doi-nhiem-vu.js";
import { listByConversation as listRuns } from "../db/sandboxRuns.js";
import { listByConversation as listArtifacts } from "../db/codeArtifacts.js";
import { listByConversation as listWebRuns } from "../db/webSearchRuns.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// BÀN GIAO
// ============================================================

/**
 * Đọc toàn bộ ngữ cảnh công việc để bàn giao cho BOSS mới.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @returns {Promise<{ok: boolean, handoff: object, error?: string}>}
 */
export async function banGiaoTrangThai({ userId, conversationId }) {
  try {
    // 1. Trạng thái công việc chính
    const workState = await loadWorkState(userId, conversationId);

    // 2. Tasks (nhiệm vụ BOSS đã giao)
    const tasks = await listTasks(conversationId);

    // 3. Subtasks của task gần nhất
    let subtasks = [];
    if (tasks.length > 0) {
      const latestTask = tasks[0];
      subtasks = await listSubTasks(String(latestTask._id));
    }

    // 4. Lần chạy Sandbox
    const sandboxRuns = await listRuns(conversationId);

    // 5. Phiên bản code
    const artifacts = await listArtifacts(conversationId);

    // 6. Lần tra Web
    const webRuns = await listWebRuns(conversationId);

    // ===== TỔNG HỢP =====
    const handoff = {
      // Yêu cầu gốc của User
      userRequest: workState?.userRequest || null,

      // Bước hiện tại + trạng thái
      currentStep: workState?.currentStep || WORK_STEP.RECEIVED,
      status: workState?.status || WORK_STATUS.PENDING,

      // Ngữ cảnh do BOSS trước để lại
      context: workState?.context || {},

      // Tình hình nhiệm vụ
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

      // Sandbox
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

      // Code
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

      // Web
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

/**
 * Dựng prompt bàn giao để nhét vào messages cho BOSS mới.
 * @param {object} handoff
 * @returns {string}
 */
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