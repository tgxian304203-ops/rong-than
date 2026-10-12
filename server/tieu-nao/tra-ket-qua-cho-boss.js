// server/tieu-nao/tra-ket-qua-cho-boss.js
// Nhiệm vụ: Trả kết quả lính về cho BOSS.
// Bao gồm: output thành công + lịch sử lỗi của các lính thất bại.

import { listByTask as listSubTasks } from "../db/subBrainTasks.js";
import { listByTask as listResults } from "../db/taskResults.js";
import { logInfo } from "../logs/ghi-log.js";

export async function traKetQuaChoBoss({ taskId }) {
  if (!taskId) {
    return { ok: false, items: [], error: "Thiếu taskId" };
  }

  const subs = await listSubTasks(taskId);
  if (subs.length === 0) {
    return { ok: false, items: [], error: "Task chưa có lính nào làm" };
  }

  const results = await listResults(taskId);

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

  // Tìm subtask thành công
  const successItems = items.filter(
    (it) =>
      it.status === "done" &&
      it.result &&
      it.result.status === "success" &&
      it.result.output
  );

  const anySuccess = successItems.length > 0;

  const merged = anySuccess
    ? successItems
        .map(
          (it, idx) =>
            `# Lính ${idx + 1} (${it.soldierModel}):\n${it.result.output}`
        )
        .join("\n\n")
    : null;

  // Lịch sử lỗi cho BOSS (nếu không có thành công)
  const failures = items
    .filter((it) => it.status === "skipped" || it.status === "error")
    .map((it) => ({
      soldier: it.soldierModel,
      provider: it.soldierProvider,
      error: it.result?.meta?.error || "Không rõ",
      partialOutput: it.result?.output || "",
    }));

  await logInfo("Tiểu Não trả kết quả cho BOSS", {
    taskId,
    totalSubtasks: items.length,
    successCount: successItems.length,
    failureCount: failures.length,
    anySuccess,
  });

  return {
    ok: anySuccess,
    items,
    merged: merged || undefined,
    failures: failures.length > 0 ? failures : undefined,
    error: anySuccess ? undefined : "Không có lính nào thành công",
  };
}

export default { traKetQuaChoBoss };