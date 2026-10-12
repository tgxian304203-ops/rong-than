// server/boss/viet-format-sua.js
// Nhiệm vụ: BOSS viết format cho lính mới khi lính cũ lỗi.
// Truyền: prompt gốc + lỗi lính cũ + output dở (nếu có).

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

  const hint = buildHintFromError(stderr, stdout);

  const format = {
    taskType: "fix-code",
    goal: `Hoàn thành nhiệm vụ. Mục tiêu gốc: ${goal || "(không rõ)"}`,
    input: failedCode || "",
    constraints: [
      `Ngôn ngữ: ${language}`,
      "TIẾP TỤC từ chỗ lính trước đã dừng — KHÔNG làm lại từ đầu nếu có output dở",
      "Nếu không có output → làm lại nhưng TRÁNH lỗi của lính trước",
    ],
    expectedOutput: "Kết quả hoàn chỉnh, đúng yêu cầu",
    context: {
      attempt,
      stdout: stdout || "",
      stderr: stderr || "",
      hint,
      failuresDesc,
      previousFailures: failures || [],
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
    failureCount: Array.isArray(failures) ? failures.length : 0,
  });

  return { ok: true, format };
}

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

  return "Đọc kỹ stderr để tìm nguyên nhân.";
}

export default { vietFormatSua };