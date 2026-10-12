// server/boss/giao-format.js
// Nhiệm vụ: Giao format cho Tiểu Não xử lý.
// Trả về danh sách lính ứng viên để goi-linh thử lần lượt.

import { nhanFormat } from "../tieu-nao/nhan-format.js";
import { docNhiemVu } from "../tieu-nao/doc-nhiem-vu.js";
import { chonLinhTheoNhiemVu } from "../tieu-nao/chon-linh-theo-nhiem-vu.js";
import { openTask } from "../state/theo-doi-nhiem-vu.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

export async function giaoFormat({
  userId,
  conversationId,
  bossSessionId,
  format,
}) {
  await logInfo("BOSS: bắt đầu giao format cho Tiểu Não", {
    userId,
    conversationId,
  });

  const received = await nhanFormat(format);
  if (!received.ok) {
    await logWarn("BOSS: Tiểu Não không nhận format", {
      error: received.error,
    });
    return { ok: false, error: received.error };
  }

  const doc = await docNhiemVu(received.format);
  if (!doc.ok) {
    await logWarn("BOSS: đọc nhiệm vụ lỗi", { error: doc.error });
    return { ok: false, error: doc.error };
  }

  const pick = await chonLinhTheoNhiemVu({
    userId,
    taskType: doc.taskType,
  });
  if (!pick.ok) {
    await logWarn("BOSS: chọn lính lỗi", { error: pick.error });
    return { ok: false, error: pick.error };
  }

  const task = await openTask({
    userId,
    conversationId,
    bossSessionId,
    taskType: doc.taskType,
    payload: received.format,
  });

  await logInfo("BOSS: đã giao format cho Tiểu Não", {
    userId,
    conversationId,
    taskId: String(task._id),
    taskType: doc.taskType,
    soldier: pick.soldier.name,
    soldierProvider: pick.soldier.provider,
    totalCandidates: (pick.candidates || []).length,
  });

  return {
    ok: true,
    taskId: String(task._id),
    soldier: pick.soldier,
    candidates: pick.candidates || [pick.soldier],  // ← DANH SÁCH để goi-linh thử
    taskType: doc.taskType,
  };
}

export default { giaoFormat };