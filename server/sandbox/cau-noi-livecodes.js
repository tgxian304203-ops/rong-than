// server/sandbox/cau-noi-livecodes.js
// Nhiệm vụ: Cầu nối tới Sandbox (Piston API công khai).
// Sửa: Báo FAILED nếu code không hợp lệ (shell, rỗng, sai loại).

import { SANDBOX_LIMITS } from "./gioi-han-tai-nguyen.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

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
  html: "html",
  css: "css",
};

function normalizeLang(lang) {
  const l = String(lang || "").toLowerCase().trim();
  return LANG_MAP[l] || null;
}

// ============================================================
// PHÁT HIỆN SHELL SCRIPT
// ============================================================

function isShellScript(code) {
  if (!code || typeof code !== "string") return false;

  const lines = code.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;

  const shellPatterns = [
    /^\s*git\s+(init|add|commit|push|pull|clone|remote|checkout|branch|merge|status|log)/,
    /^\s*npm\s+(install|run|start|init|build|test)/,
    /^\s*yarn\s+(install|add|run|start)/,
    /^\s*cd\s+[a-zA-Z]/,
    /^\s*mkdir\s+/,
    /^\s*rm\s+-rf/,
    /^\s*touch\s+/,
    /^\s*chmod\s+/,
    /^\s*chown\s+/,
    /^\s*export\s+[A-Z_]+=/,
    /^\s*sudo\s+/,
    /^\s*apt-get\s+/,
    /^\s*brew\s+install/,
    /^\s*pip\s+install/,
    /^\s*python\s+-m/,
    /^\s*node\s+[a-zA-Z]/,
    /^\s*curl\s+-/,
    /^\s*wget\s+/,
    /^\s*docker\s+/,
  ];

  const shellLines = lines.filter((l) =>
    shellPatterns.some((p) => p.test(l))
  ).length;

  return shellLines / lines.length > 0.5;
}

// ============================================================
// BUILD PAYLOAD
// ============================================================

export function buildPayload({ language, code, testCode = "", stdin = "" }) {
  const pistonLang = normalizeLang(language);

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
// SEND TO SANDBOX
// ============================================================

export async function sendToSandbox(payload) {
  const startedAt = Date.now();

  // ===== KIỂM TRA ĐẦU VÀO =====
  const code = payload?.files?.[0]?.content || "";

  // 1. Code rỗng
  if (!code.trim()) {
    return {
      ok: false,
      stdout: "",
      stderr: "Code rỗng — không có gì để chạy.",
      durationMs: 0,
      status: "failed",
      error: "EMPTY_CODE",
    };
  }

  // 2. Shell script — không phải code chạy được
  if (isShellScript(code)) {
    await logWarn("Sandbox: phát hiện shell script — báo FAILED", {
      preview: code.slice(0, 150),
    });
    return {
      ok: false,
      stdout: "",
      stderr:
        "Code là shell/git commands — không phải code HTML/JS/Python chạy được. Cần trả về code thật.",
      durationMs: 0,
      status: "failed",
      error: "SHELL_SCRIPT",
    };
  }

  // 3. Ngôn ngữ không hỗ trợ
  if (!payload.language) {
    return {
      ok: false,
      stdout: "",
      stderr: "Không nhận diện được ngôn ngữ code.",
      durationMs: 0,
      status: "failed",
      error: "UNKNOWN_LANGUAGE",
    };
  }

  // 4. HTML/CSS — bỏ qua kiểm thử logic (không phải lỗi)
  if (payload.language === "html" || payload.language === "css") {
    // Kiểm tra HTML có thẻ đặc trưng không
    if (payload.language === "html") {
      const tagCount = (
        code.match(/<(html|head|body|div|p|h[1-6]|button|input|script|style)[\s>]/gi) ||
        []
      ).length;

      if (tagCount < 2) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Code HTML không có đủ thẻ HTML cơ bản (<html>, <body>, <div>...). Cần trả về HTML đầy đủ.",
          durationMs: 0,
          status: "failed",
          error: "INVALID_HTML",
        };
      }
    }

    return {
      ok: true,
      stdout: "(HTML/CSS không cần chạy — bỏ qua kiểm thử logic)",
      stderr: "",
      durationMs: 0,
      status: "passed",
    };
  }

  // ===== GỌI PISTON =====
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
      await logWarn("Piston: HTTP lỗi", { status: res.status, body });
      return {
        ok: false,
        stdout: "",
        stderr: body?.message || `Piston HTTP ${res.status}`,
        durationMs,
        status: "error",
        error: body?.message || `Piston HTTP ${res.status}`,
      };
    }

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
// TIỆN ÍCH
// ============================================================

export function hasSandboxEndpoint() {
  return true;
}

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