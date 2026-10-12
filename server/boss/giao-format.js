// server/boss/giao-format.js
// Nhiệm vụ: Giao format cho Tiểu Não xử lý.
// Quy tắc dự án (PHẦN 02):
//   - BOSS viết format → Tiểu Não dò/gọi lính → lính làm việc.

import { nhanFormat } from "../tieu-nao/nhan-format.js";
import { docNhiemVu } from "../tieu-nao/doc-nhiem-vu.js";
import { chonLinhTheoNhiemVu } from "../tieu-nao/chon-linh-theo-nhiem-vu.js";
import { openTask } from "../state/theo-doi-nhiem-vu.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// GIAO FORMAT
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.bossSessionId
 * @param {object} p.format
 * @returns {Promise<{ok: boolean, taskId?: string, soldier?: object, taskType?: string, error?: string}>}
 */
export async function giaoFormat({
  userId,
  conversationId,
  bossSessionId,
  format,
}) {
  // 1. Tiểu Não nhận format
  const received = await nhanFormat(format);
  if (!received.ok) {
    await logWarn("Giao format thất bại: Tiểu Não không nhận", {
      error: received.error,
    });
    return { ok: false, error: received.error };
  }

  // 2. Tiểu Não đọc nhiệm vụ → taskType nội bộ
  const doc = await docNhiemVu(received.format);
  if (!doc.ok) {
    await logWarn("Giao format thất bại: đọc nhiệm vụ lỗi", {
      error: doc.error,
    });
    return { ok: false, error: doc.error };
  }

  // 3. Tiểu Não chọn lính theo nhiệm vụ
  const pick = await chonLinhTheoNhiemVu({
    userId,
    taskType: doc.taskType,
  });
  if (!pick.ok) {
    await logWarn("Giao format thất bại: chọn lính lỗi", {
      error: pick.error,
    });
    return { ok: false, error: pick.error };
  }

  // 4. Tạo task chính trong DB
  const task = await openTask({
    userId,
    conversationId,
    bossSessionId,
    taskType: doc.taskType,
    payload: received.format,
  });

  await logInfo("BOSS giao format cho Tiểu Não", {
    userId,
    conversationId,
    taskId: String(task._id),
    taskType: doc.taskType,
    soldier: pick.soldier.name,
  });

  return {
    ok: true,
    taskId: String(task._id),
    soldier: pick.soldier,
    taskType: doc.taskType,
  };
}

export default { giaoFormat };