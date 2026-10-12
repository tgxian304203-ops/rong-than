// server/state/theo-doi-nhiem-vu.js
// Nhiệm vụ: Theo dõi vòng đời nhiệm vụ.
//   - Khi BOSS giao việc → tạo task
//   - Khi Tiểu Não chia cho lính → tạo subtask
//   - Khi lính xong → ghi taskResult
//   - Khi tất cả subtask xong → đánh dấu task done

import { createTask, getTask, setStatus, listByConversation } from "../db/tasks.js";
import {
  createSubTask,
  listByTask,
  setStatus as setSubTaskStatus,
} from "../db/subBrainTasks.js";
import { saveResult, listByTask as listResults } from "../db/taskResults.js";

// ============================================================
// TASK
// ============================================================

export async function openTask({
  userId,
  conversationId,
  bossSessionId,
  taskType,
  payload,
}) {
  return createTask({
    userId,
    conversationId,
    bossSessionId,
    taskType,
    payload,
  });
}

export async function loadTask(taskId) {
  return getTask(taskId);
}

export async function markTaskStatus(taskId, status) {
  return setStatus(taskId, status);
}

export async function listTasks(conversationId) {
  return listByConversation(conversationId);
}

// ============================================================
// SUBTASK
// ============================================================

export async function addSubTask({
  taskId,
  soldierModel,
  soldierProvider,
  soldierKeyId,
  payload,
}) {
  return createSubTask({
    taskId,
    soldierModel,
    soldierProvider,
    soldierKeyId,
    payload,
  });
}

export async function listSubTasks(taskId) {
  return listByTask(taskId);
}

export async function markSubTaskStatus(subTaskId, status) {
  return setSubTaskStatus(subTaskId, status);
}

// ============================================================
// KẾT QUẢ
// ============================================================

export async function recordResult({
  taskId,
  subTaskId,
  status,
  output,
  meta,
}) {
  return saveResult({ taskId, subTaskId, status, output, meta });
}

export async function loadResults(taskId) {
  return listResults(taskId);
}

// ============================================================
// KIỂM TRA HOÀN TẤT
// ============================================================

/**
 * Kiểm tra tất cả subtask của 1 task đã xong chưa.
 */
export async function isTaskComplete(taskId) {
  const subs = await listSubTasks(taskId);
  if (subs.length === 0) return false;
  return subs.every((s) => s.status === "done");
}

/**
 * Kiểm tra có subtask nào lỗi không.
 */
export async function hasFailure(taskId) {
  const subs = await listSubTasks(taskId);
  return subs.some((s) => s.status === "error");
}

export default {
  openTask,
  loadTask,
  markTaskStatus,
  listTasks,
  addSubTask,
  listSubTasks,
  markSubTaskStatus,
  recordResult,
  loadResults,
  isTaskComplete,
  hasFailure,
};