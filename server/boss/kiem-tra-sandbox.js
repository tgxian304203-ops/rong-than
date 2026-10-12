// server/boss/kiem-tra-sandbox.js
// Nhiệm vụ: BOSS kiểm tra chạy thử code trên Sandbox.
// Quy tắc dự án (PHẦN 01, mục 10):
//   - Nếu nhiệm vụ liên quan code → BOSS kiểm tra chạy thử trên Sandbox.
//   - Đúng → trả về Rồng Thần.
//   - Sai → BOSS đưa ra cách khắc phục và viết format cho lính sửa.

import { chayKiemThu } from "../sandbox/chay-kiem-thu.js";
import { saveVersion } from "../sandbox/quan-ly-phien-ban.js";
import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// KIỂM TRA
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.language       - "javascript" | "python" | ...
 * @param {string} p.code
 * @param {string} [p.testCode]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: string,
 *   stdout: string,
 *   stderr: string,
 *   runId?: string,
 *   version?: number,
 *   error?: string,
 * }>}
 */
export async function kiemTraSandbox({
  userId,
  conversationId,
  language,
  code,
  testCode = "",
  signal,
}) {
  if (!code || typeof code !== "string") {
    return {
      ok: false,
      status: "error",
      stdout: "",
      stderr: "",
      error: "Code rỗng",
    };
  }

  // Lưu phiên bản code trước khi chạy
  let version = null;
  try {
    const saved = await saveVersion({
      userId,
      conversationId,
      language,
      code,
    });
    version = saved.version;
  } catch (err) {
    await logWarn("Không lưu được phiên bản code", {
      error: err?.message || String(err),
    });
  }

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.SANDBOX_RUNNING,
    WORK_STATUS.WAITING_SANDBOX
  );

  const res = await chayKiemThu({
    userId,
    conversationId,
    language,
    code,
    testCode,
    signal,
  });

  if (res.ok) {
    await moveToStep(
      userId,
      conversationId,
      WORK_STEP.SANDBOX_PASSED,
      WORK_STATUS.IN_PROGRESS
    );
    await logInfo("Sandbox PASS", {
      userId,
      conversationId,
      version,
      runId: res.runId,
    });
  } else {
    await moveToStep(
      userId,
      conversationId,
      WORK_STEP.SANDBOX_FAILED,
      WORK_STATUS.WAITING_BOSS
    );
    await logWarn("Sandbox FAIL/ERROR", {
      userId,
      conversationId,
      version,
      runId: res.runId,
      error: res.error,
    });
  }

  return {
    ok: res.ok,
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    runId: res.runId,
    version,
    error: res.error,
  };
}

export default { kiemTraSandbox };