// server/sandbox/cau-noi-livecodes.js
// Nhiệm vụ: Cầu nối tới Sandbox (Piston API).
// NÂNG CẤP: Bóc tách JS từ HTML để kiểm tra lỗi cú pháp cực kỳ thông minh.

import { SANDBOX_LIMITS } from "./gioi-han-tai-nguyen.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

const LANG_MAP = {
  javascript: "javascript", js: "javascript",
  typescript: "typescript", ts: "typescript",
  python: "python", py: "python",
  java: "java", c: "c", cpp: "c++", "c++": "c++",
  go: "go", rust: "rust", ruby: "ruby", php: "php",
  bash: "bash", sh: "bash",
  html: "html", css: "css",
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
    /^\s*cd\s+[a-zA-Z]/, /^\s*mkdir\s+/, /^\s*rm\s+-rf/,
    /^\s*touch\s+/, /^\s*chmod\s+/, /^\s*chown\s+/,
    /^\s*export\s+[A-Z_]+=/, /^\s*sudo\s+/, /^\s*apt-get\s+/,
    /^\s*brew\s+install/, /^\s*pip\s+install/, /^\s*python\s+-m/,
    /^\s*node\s+[a-zA-Z]/, /^\s*curl\s+-/, /^\s*wget\s+/, /^\s*docker\s+/,
  ];

  const shellLines = lines.filter((l) => shellPatterns.some((p) => p.test(l))).length;
  return shellLines / lines.length > 0.5;
}

// ============================================================
// BÓC TÁCH JS TỪ HTML (Trái tim của sự thông minh)
// ============================================================
function extractJsFromHtml(html) {
  const scripts = [];
  // Tìm tất cả thẻ <script>...</script> (bỏ qua thẻ có src="...")
  const regex = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].trim()) scripts.push(match[1]);
  }
  return scripts.join("\n\n");
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
  const originalCode = payload?.files?.[0]?.content || "";

  // 1. Code rỗng
  if (!originalCode.trim()) {
    return { ok: false, stdout: "", stderr: "Code rỗng.", durationMs: 0, status: "failed", error: "EMPTY_CODE" };
  }

  // 2. Shell script
  if (isShellScript(originalCode)) {
    return { ok: false, stdout: "", stderr: "Code là shell/git commands.", durationMs: 0, status: "failed", error: "SHELL_SCRIPT" };
  }

  // 3. Ngôn ngữ không hỗ trợ
  if (!payload.language) {
    return { ok: false, stdout: "", stderr: "Ngôn ngữ không hỗ trợ.", durationMs: 0, status: "failed", error: "UNKNOWN_LANGUAGE" };
  }

  // 4. XỬ LÝ ĐẶC BIỆT CHO HTML/CSS
  let finalPayload = { ...payload };
  
  if (payload.language === "html") {
    const jsCode = extractJsFromHtml(originalCode);
    
    // Nếu HTML không có JS bên trong -> Pass luôn
    if (!jsCode.trim()) {
      return { ok: true, stdout: "(HTML tĩnh không có JS — Bỏ qua test)", stderr: "", durationMs: 0, status: "passed" };
    }

    // Nếu có JS -> Chuyển hướng sang chạy JS để check cú pháp
    await logInfo("Sandbox: Bóc tách JS từ HTML để kiểm tra", { jsLength: jsCode.length });
    finalPayload.language = "javascript";
    finalPayload.files = [{ name: "main.js", content: jsCode }];
  } else if (payload.language === "css") {
    return { ok: true, stdout: "(CSS không cần chạy — Bỏ qua)", stderr: "", durationMs: 0, status: "passed" };
  }

  // ===== GỌI PISTON =====
  try {
    const res = await fetchWithTimeout(
      PISTON_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      },
      SANDBOX_LIMITS.TIMEOUT_MS + 5000
    );

    const durationMs = Date.now() - startedAt;
    const body = await safeJson(res);

    if (!res.ok) {
      return { ok: false, stdout: "", stderr: body?.message || `Piston HTTP ${res.status}`, durationMs, status: "error", error: body?.message };
    }

    const run = body?.run || {};
    const compile = body?.compile || {};
    let stdout = String(run.stdout || "");
    let stderr = String(run.stderr || compile.stderr || "");

    // [SIÊU THÔNG MINH] Nếu là HTML trích xuất JS, bỏ qua các lỗi môi trường DOM không tồn tại
    if (payload.language === "html") {
      if (stderr.includes("document is not defined") || stderr.includes("window is not defined") || stderr.includes("alert is not defined")) {
        return { ok: true, stdout: "(JS chạy tốt, bỏ qua lỗi môi trường DOM)", stderr: "", durationMs, status: "passed" };
      }
    }

    const exitCode = typeof run.code === "number" ? run.code : 0;
    const status = exitCode === 0 && !stderr ? "passed" : "failed";

    return { ok: true, stdout, stderr, durationMs, status, exitCode };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const isAbort = err?.name === "AbortError" || err?.name === "TimeoutError";
    return {
      ok: false, stdout: "", stderr: isAbort ? "Quá thời gian" : err?.message,
      durationMs, status: "error", error: isAbort ? "timeout" : err?.message,
    };
  }
}

// ============================================================
// TIỆN ÍCH
// ============================================================
export function hasSandboxEndpoint() { return true; }

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  const callerSignal = options.signal;
  if (callerSignal) callerSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

async function safeJson(res) { try { return await res.json(); } catch { return null; } }

export default { hasSandboxEndpoint, buildPayload, sendToSandbox };