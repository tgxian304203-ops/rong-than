// server/sandbox/doc-ket-qua.js
// Nhiệm vụ: Đọc kết quả Sandbox và phân loại.
// Trạng thái: "idle" | "running" | "passed" | "failed" | "error"

export const SANDBOX_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  PASSED: "passed",
  FAILED: "failed",
  ERROR: "error",
};

export function readResult(raw) {
  if (!raw) {
    return {
      status: SANDBOX_STATUS.ERROR,
      stdout: "",
      stderr: "",
      isPass: false,
    };
  }

  const stdout = String(raw.stdout || "");
  const stderr = String(raw.stderr || "");

  // Nếu có stderr → failed
  if (raw.status === "passed" && !stderr) {
    return {
      status: SANDBOX_STATUS.PASSED,
      stdout,
      stderr,
      isPass: true,
    };
  }

  if (raw.status === "failed" || stderr) {
    return {
      status: SANDBOX_STATUS.FAILED,
      stdout,
      stderr,
      isPass: false,
    };
  }

  if (raw.ok === false) {
    return {
      status: SANDBOX_STATUS.ERROR,
      stdout,
      stderr,
      isPass: false,
    };
  }

  return {
    status: stdout || raw.ok ? SANDBOX_STATUS.PASSED : SANDBOX_STATUS.ERROR,
    stdout,
    stderr,
    isPass: !stderr && !!raw.ok,
  };
}

export function isPass(result) {
  return result?.status === SANDBOX_STATUS.PASSED;
}

export function isFail(result) {
  return result?.status === SANDBOX_STATUS.FAILED;
}

export function isError(result) {
  return result?.status === SANDBOX_STATUS.ERROR;
}

export default {
  SANDBOX_STATUS,
  readResult,
  isPass,
  isFail,
  isError,
};