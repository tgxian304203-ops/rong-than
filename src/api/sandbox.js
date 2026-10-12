// src/api/sandbox.js
// Nhiệm vụ: API Sandbox (LiveCodes)
// - BOSS gửi code để chạy kiểm thử
// - Đọc kết quả PASS / FAIL / ERROR
// - Quản lý phiên bản code

import api from "./client.js";

// ============================================================
// TRẠNG THÁI SANDBOX (theo shared/constants/sandboxStatus.js)
// ============================================================
// "idle" | "running" | "passed" | "failed" | "error"

// ============================================================
// CHẠY KIỂM THỬ
// ============================================================

/**
 * @param {object} payload
 * @param {string} payload.language - "javascript" | "python" | "html" | ...
 * @param {string} payload.code - mã nguồn
 * @param {string} [payload.testCode] - mã kiểm thử (nếu có)
 * @param {object} [payload.input] - dữ liệu vào
 * @param {number} [payload.timeoutMs=10000]
 * @returns {Promise<{status: string, stdout: string, stderr: string, durationMs: number, runId: string}>}
 */
export async function runTest({
  language,
  code,
  testCode,
  input,
  timeoutMs = 10000,
}) {
  return api.post("/sandbox/run", {
    language,
    code,
    testCode,
    input,
    timeoutMs,
  });
}

// ============================================================
// LẤY KẾT QUẢ LẦN CHẠY
// ============================================================

export async function getRun(runId) {
  return api.get(`/sandbox/runs/${encodeURIComponent(runId)}`);
}

// ============================================================
// PHIÊN BẢN CODE
// ============================================================

export async function listArtifacts(conversationId) {
  return api.get(
    `/sandbox/artifacts?conversationId=${encodeURIComponent(conversationId)}`
  );
}

export async function saveArtifact({ conversationId, language, code, version }) {
  return api.post("/sandbox/artifacts", {
    conversationId,
    language,
    code,
    version,
  });
}