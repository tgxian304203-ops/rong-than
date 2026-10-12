// server/tieu-nao/doc-nhiem-vu.js
// Nhiệm vụ: Đọc nhiệm vụ trong format BOSS giao.
// Chuyển taskType của BOSS → taskType nội bộ của Tiểu Não
// để chọn đúng lính (model).

import { TIEU_NAO_TASK } from "./danh-sach-ung-vien.js";
import { logWarn } from "../logs/ghi-log.js";

// ============================================================
// MAP taskType BOSS → TIEU_NAO_TASK
// ============================================================

const TASK_MAP = {
  code: TIEU_NAO_TASK.WRITE_CODE,
  "write-code": TIEU_NAO_TASK.WRITE_CODE,
  fix: TIEU_NAO_TASK.FIX_CODE,
  "fix-code": TIEU_NAO_TASK.FIX_CODE,
  analysis: TIEU_NAO_TASK.ANALYZE_CODE,
  "analyze-code": TIEU_NAO_TASK.ANALYZE_CODE,
  "read-long-doc": TIEU_NAO_TASK.READ_LONG_DOC,
  document: TIEU_NAO_TASK.READ_LONG_DOC,
  summary: TIEU_NAO_TASK.SUMMARY,
  research: TIEU_NAO_TASK.RESEARCH,
  search: TIEU_NAO_TASK.RESEARCH,
  bulk: TIEU_NAO_TASK.BULK,
  "large": TIEU_NAO_TASK.BULK,
};

// ============================================================
// ĐỌC NHIỆM VỤ
// ============================================================

/**
 * @param {object} format - từ nhanFormat()
 * @returns {Promise<{ok: boolean, taskType?: string, goal?: string, input?: string, constraints?: string[], expectedOutput?: string, context?: object, error?: string}>}
 */
export async function docNhiemVu(format) {
  if (!format || typeof format !== "object") {
    return { ok: false, error: "Format rỗng" };
  }

  const rawType = String(format.taskType || "").toLowerCase();
  const mapped = TASK_MAP[rawType];

  if (!mapped) {
    await logWarn("Tiểu Não: taskType không nhận diện được", {
      rawType,
    });
    return {
      ok: false,
      error: `taskType không nhận diện được: ${rawType}`,
    };
  }

  return {
    ok: true,
    taskType: mapped,
    goal: String(format.goal || ""),
    input: String(format.input || ""),
    constraints: Array.isArray(format.constraints) ? format.constraints : [],
    expectedOutput: String(format.expectedOutput || ""),
    context: format.context && typeof format.context === "object" ? format.context : {},
  };
}

export default { docNhiemVu };