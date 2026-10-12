// server/sandbox/cau-noi-livecodes.js
// Nhiệm vụ: Cầu nối tới Sandbox (chạy code ở backend).
//
// Dùng Piston API công khai: https://emkc.org/api/v2/piston/execute
// - Miễn phí 100%
// - Không cần API key
// - Hỗ trợ 60+ ngôn ngữ (JS, Python, HTML, Java, C++, Go...)

import { SANDBOX_LIMITS } from "./gioi-han-tai-nguyen.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// PISTON
// ============================================================

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

// Map ngôn ngữ dự án → Piston language
const LANG_MAP = {
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  python: "python",
  py: "python",
  java: "java",
  c: "c",
  cpp: "c++",
  "c++": "c++",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  php: "php",
  bash: "bash",
  sh: "bash",
  // HTML/CSS là frontend — Piston không chạy trực tiếp
  html: "html",
  css: "css",
};

function normalizeLang(lang) {
  const l = String(lang || "").toLowerCase().trim();
  return LANG_MAP[l] || "javascript";
}

// ============================================================
// BUILD PAYLOAD
// ============================================================

export function buildPayload({ language, code, testCode = "", stdin = "" }) {
  const pistonLang = normalizeLang(language);

  // Nếu có testCode → gộp code + test vào 1 file
  let content = code;
  if (testCode && typeof testCode === "string" && testCode.trim()) {
    content = `${code}\n\n// ===== TEST =====\n${testCode}`;
  }

  return {
    language: pistonLang,
    version: "*",
    files: [{ name: "main", content }],
    stdin: stdin || "",
    run_timeout: SANDBOX_LIMITS.TIMEOUT_MS,
  };
}

// ============================================================
// GỬI TỚI PISTON
// ============================================================

/**
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, durationMs: number, status: string, error?: string}>}
 */
export async function sendToSandbox(payload) {
  const startedAt = Date.now();

  // HTML/CSS — Piston không chạy được → trả "passed" vì không có gì để test logic
  if (payload.language === "html" || payload.language === "css") {
    return {
      ok: true,
      stdout: "(HTML/CSS không cần chạy — bỏ qua kiểm thử logic)",
      stderr: "",
      durationMs: 0,
      status: "passed",
    };
  }

  try {
    const res = await fetchWithTimeout(
      PISTON_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      SANDBOX_LIMITS.TIMEOUT_MS + 5000
    );

    const durationMs = Date.now() - startedAt;
    const body = await safeJson(res);

    if (!res.ok) {
      await logWarn("Piston: HTTP lỗi", {
        status: res.status,
        body,
      });
      return {
        ok: false,
        stdout: "",
        stderr: body?.message || `Piston HTTP ${res.status}`,
        durationMs,
        status: "error",
        error: body?.message || `Piston HTTP ${res.status}`,
      };
    }

    // Piston trả về: { run: { stdout, stderr, code, signal } }
    const run = body?.run || {};
    const compile = body?.compile || {};

    const stdout = String(run.stdout || "");
    const stderr = String(run.stderr || compile.stderr || "");
    const exitCode = typeof run.code === "number" ? run.code : 0;

    const status = exitCode === 0 && !stderr ? "passed" : "failed";

    return {
      ok: true,
      stdout,
      stderr,
      durationMs,
      status,
      exitCode,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const isAbort =
      err?.name === "AbortError" || err?.name === "TimeoutError";

    await logWarn("Piston: gọi lỗi", {
      error: err?.message || String(err),
      isAbort,
    });

    return {
      ok: false,
      stdout: "",
      stderr: isAbort
        ? "Piston quá thời gian"
        : err?.message || "Lỗi Piston",
      durationMs,
      status: "error",
      error: isAbort ? "timeout" : err?.message || "Lỗi Piston",
    };
  }
}

// ============================================================
// KIỂM TRA ENDPOINT
// ============================================================

export function hasSandboxEndpoint() {
  // Piston công khai — luôn có
  return true;
}

// ============================================================
// TIỆN ÍCH
// ============================================================

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  const callerSignal = options.signal;
  if (callerSignal) {
    callerSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

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