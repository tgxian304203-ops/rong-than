// server/tieu-nao/tra-ket-qua-cho-boss.js
// Nhiệm vụ: Trả kết quả của lính về cho BOSS.
// Quy tắc dự án (PHẦN 01, mục 8, 9):
//   - Lính làm việc BOSS giao.
//   - Sau khi làm xong phải đưa câu trả lời cho BOSS.

import { listByTask as listSubTasks } from "../db/subBrainTasks.js";
import { listByTask as listResults } from "../db/taskResults.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// TRẢ KẾT QUẢ
// ============================================================

/**
 * Gộp kết quả của tất cả lính đã làm xong cho 1 task, trả về BOSS.
 * @param {object} p
 * @param {string} p.taskId
 * @returns {Promise<{ok: boolean, items: Array, merged?: string, error?: string}>}
 */
export async function traKetQuaChoBoss({ taskId }) {
  if (!taskId) {
    return { ok: false, items: [], error: "Thiếu taskId" };
  }

  const subs = await listSubTasks(taskId);
  if (subs.length === 0) {
    return { ok: false, items: [], error: "Task chưa có lính nào làm" };
  }

  const results = await listResults(taskId);

  // Ghép kết quả mới nhất của mỗi subtask
  const latestBySub = new Map();
  for (const r of results) {
    const sid = String(r.subTaskId);
    const prev = latestBySub.get(sid);
    if (!prev || new Date(r.createdAt) > new Date(prev.createdAt)) {
      latestBySub.set(sid, r);
    }
  }

  const items = subs.map((s) => {
    const sid = String(s._id);
    const r = latestBySub.get(sid);
    return {
      subTaskId: sid,
      soldierModel: s.soldierModel,
      soldierProvider: s.soldierProvider,
      status: s.status,
      result: r
        ? {
            status: r.status,
            output: r.output,
            meta: r.meta,
            createdAt: r.createdAt,
          }
        : null,
    };
  });

  // Gộp các output thành 1 chuỗi để BOSS dễ đọc (chỉ khi tất cả cùng done)
  const allDone = items.every((it) => it.status === "done" && it.result);
  const merged = allDone
    ? items
        .map(
          (it, idx) =>
            `# Lính ${idx + 1} (${it.soldierModel}):\n${it.result.output}`
        )
        .join("\n\n")
    : null;

  await logInfo("Tiểu Não trả kết quả cho BOSS", {
    taskId,
    count: items.length,
    allDone,
  });

  return {
    ok: allDone,
    items,
    merged: merged || undefined,
    error: allDone ? undefined : "Chưa phải tất cả lính đều xong",
  };
}

export default { traKetQuaChoBoss };