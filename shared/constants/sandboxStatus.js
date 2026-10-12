// shared/constants/sandboxStatus.js
// Nhiệm vụ: 5 trạng thái Sandbox.
// Dùng để theo dõi quá trình chạy code kiểm thử.

export const SANDBOX_STATUS = {
  // Chưa chạy
  IDLE: "idle",

  // Đang chạy
  RUNNING: "running",

  // Chạy thành công (không có stderr, exit code OK)
  PASSED: "passed",

  // Chạy xong nhưng có lỗi (stderr, exit code != 0)
  FAILED: "failed",

  // Lỗi khi gọi Sandbox (mạng, timeout, chưa cấu hình endpoint)
  ERROR: "error",
};

export const SANDBOX_STATUS_LIST = Object.values(SANDBOX_STATUS);

export function isValidSandboxStatus(status) {
  return SANDBOX_STATUS_LIST.includes(status);
}

export function isSandboxTerminal(status) {
  return (
    status === SANDBOX_STATUS.PASSED ||
    status === SANDBOX_STATUS.FAILED ||
    status === SANDBOX_STATUS.ERROR
  );
}

export function isSandboxPassed(status) {
  return status === SANDBOX_STATUS.PASSED;
}

export function isSandboxFailed(status) {
  return status === SANDBOX_STATUS.FAILED;
}

export default {
  SANDBOX_STATUS,
  SANDBOX_STATUS_LIST,
  isValidSandboxStatus,
  isSandboxTerminal,
  isSandboxPassed,
  isSandboxFailed,
};