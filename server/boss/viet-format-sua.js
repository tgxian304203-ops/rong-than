// server/boss/viet-format-sua.js
// Nhiệm vụ: BOSS viết format sửa khi Sandbox báo lỗi.
// Sửa: Nhận diện lỗi loại code — hướng dẫn lính trả code thật.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

export async function vietFormatSua({
  userId,
  conversationId,
  goal,
  failedCode,
  stdout,
  stderr,
  attempt = 1,
  language = "javascript",
  failures = null,
}) {
  if (!failedCode && (!failures || failures.length === 0)) {
    return { ok: false, format: null, error: "Thiếu dữ liệu để sửa" };
  }

  // ============================================================
  // NHẬN DIỆN LỖI LOẠI CODE
  // ============================================================
  const errLower = String(stderr || "").toLowerCase();
  const isShellError =
    errLower.includes("shell") ||
    errLower.includes("git command") ||
    errLower.includes("shell/git");
  const isEmptyError = errLower.includes("code rỗng");
  const isInvalidHtml = errLower.includes("html không có đủ thẻ");

  let specialHint = "";
  if (isShellError) {
    specialHint =
      "🚨 LỖI NGHIÊM TRỌNG: Bạn đã trả về SHELL/GIT COMMANDS thay vì code.\n" +
      "YÊU CẦU: Trả về CODE HTML/JS/PYTHON CHẠY ĐƯỢC — không phải lệnh terminal.\n" +
      "Code HTML phải có <!DOCTYPE html>, <html>, <head>, <body> đầy đủ.\n" +
      "KHÔNG trả về: git init, npm install, cd, mkdir, hay hướng dẫn cài đặt.";
  } else if (isEmptyError) {
    specialHint =
      "🚨 LỖI: Code rỗng.\n" +
      "YÊU CẦU: Trả về code đầy đủ, không được để trống.";
  } else if (isInvalidHtml) {
    specialHint =
      "🚨 LỖI: HTML không đầy đủ.\n" +
      "YÊU CẦU: Trả về HTML với đầy đủ thẻ <!DOCTYPE html>, <html>, <head>, <body>, <div>...";
  }

  // Xây dựng mô tả lỗi từ failures
  let failuresDesc = "";
  if (Array.isArray(failures) && failures.length > 0) {
    failuresDesc = failures
      .map(
        (f, i) =>
          `Lính #${i + 1} (${f.soldier}): ${f.error}${
            f.partialOutput ? ` — Output dở: ${f.partialOutput.slice(0, 200)}...` : ""
          }`
      )
      .join("\n");
  }

  const hint = specialHint || buildHintFromError(stderr, stdout);

  const format = {
    taskType: "fix-code",
    goal: `Hoàn thành nhiệm vụ. Mục tiêu gốc: ${goal || "(không rõ)"}

${specialHint}

QUY TẮC BẮT BUỘC:
- Trả về CODE HTML/JS/PYTHON CHẠY ĐƯỢC — không phải shell script.
- KHÔNG trả về lệnh git, npm, cd, mkdir, hướng dẫn cài đặt.
- Code phải chạy được NGAY khi mở file trong trình duyệt.
- Nếu là HTML: có <!DOCTYPE html>, <html>, <head>, <body> đầy đủ.`,
    input: failedCode || "",
    constraints: [
      `Ngôn ngữ: HTML hoặc JavaScript hoặc Python`,
      "KHÔNG dùng shell commands (git, npm, cd...)",
      "Code phải CHẠY ĐƯỢC — không phải mô tả",
      "TIẾP TỤC từ chỗ lính trước đã dừng nếu có output dở",
    ],
    expectedOutput:
      "Code HTML/JS/Python hoàn chỉnh, chạy được ngay, không phải shell script.",
    context: {
      attempt,
      stdout: stdout || "",
      stderr: stderr || "",
      hint,
      failuresDesc,
      previousFailures: failures || [],
      isWrongType: isShellError || isInvalidHtml || isEmptyError,
      wrongTypeReason: specialHint,
    },
  };

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.FIXING,
    WORK_STATUS.WAITING_SOLDIER
  );

  await logInfo("BOSS viết format sửa cho lính mới", {
    userId,
    conversationId,
    attempt,
    isWrongType: format.context.isWrongType,
    failureCount: Array.isArray(failures) ? failures.length : 0,
  });

  return { ok: true, format };
}

// ============================================================
// HINT TỪ LỖI
// ============================================================

function buildHintFromError(stderr, stdout) {
  const s = String(stderr || "") + "\n" + String(stdout || "");
  const lower = s.toLowerCase();

  if (!s.trim()) return "Không có thông báo lỗi cụ thể.";

  if (lower.includes("syntaxerror")) return "Lỗi cú pháp — kiểm tra dấu ngoặc, dấu phẩy.";
  if (lower.includes("typeerror")) return "Lỗi kiểu — kiểm tra biến undefined / null.";
  if (lower.includes("referenceerror")) return "Tham chiếu sai — kiểm tra tên biến/hàm.";
  if (lower.includes("modulenotfound")) return "Thiếu module — kiểm tra import.";
  if (lower.includes("timeout")) return "Chạy quá lâu — kiểm tra vòng lặp vô hạn.";
  if (lower.includes("quota") || lower.includes("429")) return "Hết quota — chuyển sang key/model khác.";
  if (lower.includes("shell") || lower.includes("git command"))
    return "🚨 Lính trả về shell/git — cần trả về CODE thật.";
  if (lower.includes("html")) return "HTML thiếu thẻ — cần đầy đủ <html>, <body>...";

  return "Đọc kỹ stderr để tìm nguyên nhân.";
}

export default { vietFormatSua };