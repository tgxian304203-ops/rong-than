// server/tieu-nao/nhan-format.js
// Nhiệm vụ: Nhận format điều phối từ BOSS.
// BOSS viết format → giao cho Tiểu Não → Tiểu Não đọc nhiệm vụ.
// Quy tắc dự án (PHẦN 01, mục 3, 4, 7, 8):
//   - BOSS viết format điều phối model của Tiểu Não.
//   - Tiểu Não đọc nhiệm vụ trong format.
//   - Tiểu Não gọi lính theo nhiệm vụ.
//   - Lính làm việc BOSS giao.

import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CẤU TRÚC FORMAT CHUẨN
// ============================================================
// Format gợi ý (BOSS phải sinh ra theo cấu trúc này):
// {
//   "taskType": "code" | "fix" | "analysis" | "summary" | "research" | "read-long-doc" | "bulk",
//   "goal": "mô tả ngắn nhiệm vụ",
//   "input": "dữ liệu vào (nếu có)",
//   "constraints": ["ràng buộc 1", "ràng buộc 2"],
//   "expectedOutput": "mô tả kết quả mong đợi",
//   "context": { ... }
// }

// ============================================================
// NHẬN FORMAT
// ============================================================

/**
 * Tiếp nhận và kiểm tra format từ BOSS.
 * @param {object} raw - đối tượng format (đã parse JSON) hoặc chuỗi JSON
 * @returns {Promise<{ok: boolean, format?: object, error?: string}>}
 */
export async function nhanFormat(raw) {
  let parsed = raw;

  // Nếu là chuỗi JSON → thử parse
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      await logWarn("Tiểu Não: format không phải JSON hợp lệ", {
        error: err?.message || String(err),
      });
      return { ok: false, error: "Format không phải JSON hợp lệ" };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Format rỗng hoặc không phải object" };
  }

  if (!parsed.taskType || typeof parsed.taskType !== "string") {
    return { ok: false, error: "Format thiếu taskType" };
  }

  if (!parsed.goal || typeof parsed.goal !== "string") {
    return { ok: false, error: "Format thiếu goal (mô tả nhiệm vụ)" };
  }

  await logInfo("Tiểu Não: nhận format từ BOSS", {
    taskType: parsed.taskType,
    goal: parsed.goal.slice(0, 120),
  });

  return { ok: true, format: parsed };
}

export default { nhanFormat };