// server/sandbox/cau-noi-livecodes.js
// Nhiệm vụ: Cầu nối tới Sandbox (LiveCodes).
//
// LƯU Ý:
//   - LiveCodes là môi trường chạy code trên trình duyệt.
//   - Backend KHÔNG chạy LiveCodes trực tiếp.
//   - Có 2 cách triển khai:
//       (A) Backend gọi 1 dịch vụ trung gian (self-host LiveCodes API).
//       (B) Backend nhờ frontend chạy và trả kết quả về.
//
//   File này cung cấp lớp trừu tượng để:
//     - Đóng gói payload chuẩn để gửi tới Sandbox
//     - Chuẩn hóa kết quả trả về
//   Nếu chưa cấu hình SANDBOX_ENDPOINT → trả lỗi rõ ràng,
//   KHÔNG giả lập kết quả.

import { env } from "../config/env.js";
import { SANDBOX_LIMITS } from "./gioi-han-tai-nguyen.js";

// ============================================================
// ENDPOINT SANDBOX (nếu có)
// ============================================================

function getSandboxEndpoint() {
  return process.env.SANDBOX_ENDPOINT || "";
}

export function hasSandboxEndpoint() {
  return !!getSandboxEndpoint();
}

// ============================================================
// PAYLOAD CHUẨN
// ============================================================

/**
 * Đóng gói payload chuẩn cho Sandbox.
 */
export function buildPayload({ language, code, testCode = "", stdin = "" }) {
  return {
    language,
    code,
    testCode,
    stdin,
    timeoutMs: SANDBOX_LIMITS.TIMEOUT_MS,
  };
}

// ============================================================
// GỬI TỚI SANDBOX
// ============================================================

/**
 * Gửi payload tới Sandbox.
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, durationMs: number, status: string, error?: string}>}
 */
export async function sendToSandbox(payload) {
  const endpoint = getSandboxEndpoint();

  if (!endpoint) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      durationMs: 0,
      status: "error",
      error:
        "Chưa cấu hình SANDBOX_ENDPOINT. Backend không thể chạy code nếu chưa có endpoint Sandbox.",
    };
  }

  const startedAt = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SANDBOX_LIMITS.TIMEOUT_MS + 2000),
    });

    const durationMs = Date.now() - startedAt;
    const body = await safeJson(res);

    if (!res.ok) {
      return {
        ok: false,
        stdout: body?.stdout || "",
        stderr: body?.stderr || body?.error || `HTTP ${res.status}`,
        durationMs,
        status: "error",
        error: body?.error || `Sandbox HTTP ${res.status}`,
      };
    }

    // Chuẩn hóa kết quả
    const stdout = typeof body?.stdout === "string" ? body.stdout : "";
    const stderr = typeof body?.stderr === "string" ? body.stderr : "";
    const status =
      body?.status === "passed" || body?.status === "failed"
        ? body.status
        : stderr
        ? "failed"
        : "passed";

    return {
      ok: true,
      stdout,
      stderr,
      durationMs: body?.durationMs || durationMs,
      status,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const isAbort = err?.name === "AbortError" || err?.name === "TimeoutError";
    return {
      ok: false,
      stdout: "",
      stderr: isAbort ? "Sandbox quá thời gian" : err?.message || "Lỗi Sandbox",
      durationMs,
      status: "error",
      error: isAbort ? "timeout" : err?.message || "Lỗi Sandbox",
    };
  }
}

// ============================================================
// TIỆN ÍCH
// ============================================================

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default {
  hasSandboxEndpoint,
  buildPayload,
  sendToSandbox,
};