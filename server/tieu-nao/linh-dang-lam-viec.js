// server/tieu-nao/linh-dang-lam-viec.js
// Nhiệm vụ: Quản lý trạng thái "lính đang làm việc".
// Mỗi lính = 1 model được Tiểu Não gọi lên từ key Tiểu Não.
// Lính làm việc BOSS giao, xong thì trả kết quả cho BOSS.

import { createSubTask, setStatus, listByTask, getSubTask } from "../db/subBrainTasks.js";

// ============================================================
// TẠO LÍNH ĐANG LÀM VIỆC
// ============================================================

export async function batDauLamViec({
  taskId,
  soldierModel,
  soldierProvider,
  soldierKeyId,
  payload,
}) {
  const sub = await createSubTask({
    taskId,
    soldierModel,
    soldierProvider,
    soldierKeyId,
    payload,
  });
  await setStatus(String(sub._id), "running");
  return sub;
}

// ============================================================
// ĐỌC
// ============================================================

export async function layLinhDangLam(taskId) {
  const subs = await listByTask(taskId);
  return subs.filter((s) => s.status === "running");
}

export async function lietKeLinh(taskId) {
  return listByTask(taskId);
}

export async function layMotLinh(subTaskId) {
  return getSubTask(subTaskId);
}

// ============================================================
// KẾT THÚC
// ============================================================

export async function ketThucLamViec(subTaskId) {
  return setStatus(subTaskId, "done");
}

export async function baoLoiLamViec(subTaskId) {
  return setStatus(subTaskId, "error");
}

export default {
  batDauLamViec,
  layLinhDangLam,
  lietKeLinh,
  layMotLinh,
  ketThucLamViec,
  baoLoiLamViec,
};