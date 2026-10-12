// server/boss/viet-format-sua.js
// Nhiệm vụ: BOSS viết format cho lính sửa code khi Sandbox FAIL.
// Quy tắc dự án (PHẦN 01, mục 10):
//   - Sai → BOSS đưa ra cách khắc phục và tiếp tục viết format cho lính sửa.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// VIẾT FORMAT SỬA
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.goal            - mục tiêu ban đầu
 * @param {string} p.failedCode      - code bị lỗi
 * @param {string} p.stdout
 * @param {string} p.stderr
 * @param {number} [p.attempt]       - lần thử hiện tại
 * @param {string} [p.language]
 * @returns {Promise<{ok: boolean, format: object, error?: string}>}
 */
export async function vietFormatSua({
  userId,
  conversationId,
  goal,
  failedCode,
  stdout,
  stderr,
  attempt = 1,
  language = "javascript",
}) {
  if (!failedCode) {
    return { ok: false, format: null, error: "Thiếu code lỗi để sửa" };
  }

  // BOSS đưa cách khắc phục sơ bộ (dựa trên stderr)
  const hint = buildHintFromError(stderr, stdout);

  const format = {
    taskType: "fix-code",
    goal: `Sửa code để vượt qua kiểm thử. Mục tiêu gốc: ${goal || "(không rõ)"}`,
    input: failedCode,
    constraints: [
      `Ngôn ngữ: ${language}`,
      "Giữ nguyên hành vi đúng, chỉ sửa lỗi",
      "Không đổi cấu trúc API công khai trừ khi cần",
    ],
    expectedOutput: "Code đã sửa, chạy được và vượt kiểm thử",
    context: {
      attempt,
      stdout: stdout || "",
      stderr: stderr || "",
      hint,
    },
  };

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.FIXING,
    WORK_STATUS.WAITING_SOLDIER
  );

  await logInfo("BOSS viết format sửa code", {
    userId,
    conversationId,
    attempt,
  });

  return { ok: true, format };
}

// ============================================================
// SINH GỢI Ý TỪ LỖI
// ============================================================

function buildHintFromError(stderr, stdout) {
  const s = String(stderr || "") + "\n" + String(stdout || "");
  const lower = s.toLowerCase();

  if (!s.trim()) return "Không có thông báo lỗi cụ thể.";

  if (lower.includes("syntaxerror")) return "Lỗi cú pháp — kiểm tra dấu ngoặc, dấu phẩy.";
  if (lower.includes("typeerror")) return "Lỗi kiểu — kiểm tra biến undefined / null.";
  if (lower.includes("referenceerror")) return "Tham chiếu sai — kiểm tra tên biến/hàm.";
  if (lower.includes("modulenotfound")) return "Thiếu module — kiểm tra import.";
  if (lower.includes("indentation")) return "Lỗi thụt lề — kiểm tra khoảng trắng Python.";
  if (lower.includes("timeout")) return "Chạy quá lâu — kiểm tra vòng lặp vô hạn.";

  return "Đọc kỹ stderr để tìm nguyên nhân.";
}

export default { vietFormatSua };