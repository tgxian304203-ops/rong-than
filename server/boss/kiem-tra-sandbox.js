// server/boss/kiem-tra-sandbox.js
// Nhiệm vụ: BOSS kiểm tra chạy thử code trên Sandbox.

import { chayKiemThu } from "../sandbox/chay-kiem-thu.js";
import { saveVersion } from "../sandbox/quan-ly-phien-ban.js";
import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

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
    await logWarn("BOSS: không lưu được phiên bản code", {
      error: err?.message || String(err),
    });
  }

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.SANDBOX_RUNNING,
    WORK_STATUS.WAITING_SANDBOX
  );

  await logInfo("BOSS: bắt đầu chạy Sandbox", {
    userId,
    conversationId,
    language,
    version,
  });

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
    await logInfo("Sandbox: PASS", {
      userId,
      conversationId,
      version,
      runId: res.runId,
      durationMs: res.durationMs,
    });
  } else {
    await moveToStep(
      userId,
      conversationId,
      WORK_STEP.SANDBOX_FAILED,
      WORK_STATUS.WAITING_BOSS
    );
    await logWarn("Sandbox: FAIL / ERROR", {
      userId,
      conversationId,
      version,
      runId: res.runId,
      status: res.status,
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