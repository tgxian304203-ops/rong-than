// server/sandbox/chay-kiem-thu.js
// Nhiệm vụ: Chạy bài kiểm thử code.
//
// Quy tắc dự án:
//   - BOSS kiểm tra chạy thử trên Sandbox.
//   - Đúng → trả kết quả cho Rồng Thần.
//   - Sai → BOSS đưa cách khắc phục và viết format cho lính sửa.
//   - Lặp lại cho tới khi đúng mới thôi.

import { createRun, finishRun } from "../db/sandboxRuns.js";
import { saveTestResult } from "../db/testResults.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import {
  buildPayload,
  sendToSandbox,
  hasSandboxEndpoint,
} from "./cau-noi-livecodes.js";
import { SANDBOX_STATUS, readResult } from "./doc-ket-qua.js";
import {
  canRun,
  enterRun,
  exitRun,
  checkCodeSize,
  truncateOutput,
} from "./gioi-han-tai-nguyen.js";

// ============================================================
// CHẠY
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.language
 * @param {string} p.code
 * @param {string} [p.testCode]
 * @param {string} [p.stdin]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, status: string, stdout: string, stderr: string, durationMs: number, runId?: string, error?: string}>}
 */
export async function chayKiemThu({
  userId,
  conversationId,
  language,
  code,
  testCode = "",
  stdin = "",
  signal,
}) {
  // ===== Kiểm tra endpoint =====
  if (!hasSandboxEndpoint()) {
    const error =
      "Chưa cấu hình SANDBOX_ENDPOINT. Backend không chạy được Sandbox.";
    await logWarn(error, { conversationId });
    return {
      ok: false,
      status: SANDBOX_STATUS.ERROR,
      stdout: "",
      stderr: "",
      durationMs: 0,
      error,
    };
  }

  // ===== Kiểm tra kích thước =====
  const sizeCheck = checkCodeSize(code, false);
  if (!sizeCheck.ok) {
    return {
      ok: false,
      status: SANDBOX_STATUS.ERROR,
      stdout: "",
      stderr: "",
      durationMs: 0,
      error: sizeCheck.error,
    };
  }
  if (testCode) {
    const testSizeCheck = checkCodeSize(testCode, true);
    if (!testSizeCheck.ok) {
      return {
        ok: false,
        status: SANDBOX_STATUS.ERROR,
        stdout: "",
        stderr: "",
        durationMs: 0,
        error: testSizeCheck.error,
      };
    }
  }

  // ===== Kiểm tra tải đồng thời =====
  if (!canRun()) {
    return {
      ok: false,
      status: SANDBOX_STATUS.ERROR,
      stdout: "",
      stderr: "",
      durationMs: 0,
      error: "Sandbox đang bận, vui lòng thử lại sau ít giây.",
    };
  }

  // ===== Tạo bản ghi run =====
  const run = await createRun({
    userId,
    conversationId,
    language,
    code,
    testCode,
  });
  const runId = String(run._id);

  enterRun();

  try {
    await logInfo("Sandbox: bắt đầu chạy", {
      runId,
      conversationId,
      language,
    });

    const payload = buildPayload({ language, code, testCode, stdin });
    const raw = await sendToSandbox(payload);

    const stdout = truncateOutput(raw.stdout || "");
    const stderr = truncateOutput(raw.stderr || "");
    const durationMs = raw.durationMs || 0;

    const result = readResult({
      ok: raw.ok,
      status: raw.status,
      stdout,
      stderr,
    });

    // Cập nhật bản ghi run
    await finishRun(runId, {
      status: result.status,
      stdout,
      stderr,
      durationMs,
    });

    // Lưu test result chi tiết
    try {
      await saveTestResult({
        runId,
        name: "sandbox",
        status:
          result.status === SANDBOX_STATUS.PASSED
            ? "PASS"
            : result.status === SANDBOX_STATUS.FAILED
            ? "FAIL"
            : "ERROR",
        message: stderr || (result.isPass ? "OK" : ""),
      });
    } catch {
      /* bỏ qua nếu lỗi lưu test */
    }

    await logInfo("Sandbox: kết thúc", {
      runId,
      status: result.status,
      durationMs,
    });

    return {
      ok: result.status === SANDBOX_STATUS.PASSED,
      status: result.status,
      stdout,
      stderr,
      durationMs,
      runId,
      error: raw.error || null,
    };
  } catch (err) {
    await logWarn("Sandbox: lỗi khi chạy", {
      runId,
      error: err?.message || String(err),
    });
    try {
      await finishRun(runId, {
        status: SANDBOX_STATUS.ERROR,
        stdout: "",
        stderr: String(err?.message || err),
        durationMs: 0,
      });
    } catch {
      /* bỏ qua */
    }
    return {
      ok: false,
      status: SANDBOX_STATUS.ERROR,
      stdout: "",
      stderr: "",
      durationMs: 0,
      runId,
      error: err?.message || "Lỗi không xác định khi chạy Sandbox",
    };
  } finally {
    exitRun();
  }
}

export default { chayKiemThu };