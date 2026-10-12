// server/state/luu-trang-thai.js
// Nhiệm vụ: Lưu trạng thái công việc.
// Khi BOSS hết quota/lỗi, BOSS mới phải đọc lại trạng thái để biết:
//   - Yêu cầu User
//   - Đang ở bước nào
//   - Bước tiếp theo

import { upsertState, getState, setStep, clearState } from "../db/workStates.js";

// ============================================================
// TRẠNG THÁI HỢP LỆ
// ============================================================

export const WORK_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  WAITING_BOSS: "waiting_boss",
  WAITING_SOLDIER: "waiting_soldier",
  WAITING_SANDBOX: "waiting_sandbox",
  DONE: "done",
  ERROR: "error",
};

export const WORK_STEP = {
  RECEIVED: "received",           // vừa nhận yêu cầu
  CLASSIFIED: "classified",       // đã phân loại yêu cầu
  NEED_WEB: "need_web",           // cần tra web
  WEB_DONE: "web_done",           // đã tra web xong
  FORMAT_WRITTEN: "format_written", // BOSS đã viết format
  SOLDIER_WORKING: "soldier_working", // lính đang làm
  SOLDIER_DONE: "soldier_done",   // lính đã trả kết quả
  SANDBOX_RUNNING: "sandbox_running",
  SANDBOX_PASSED: "sandbox_passed",
  SANDBOX_FAILED: "sandbox_failed",
  FIXING: "fixing",               // đang sửa code
  DELIVERED: "delivered",         // đã trả kết quả cho User
};

// ============================================================
// LƯU
// ============================================================

/**
 * Khởi tạo / cập nhật trạng thái công việc.
 */
export async function saveWorkState({
  userId,
  conversationId,
  userRequest,
  currentStep = WORK_STEP.RECEIVED,
  status = WORK_STATUS.PENDING,
  context = {},
}) {
  return upsertState({
    userId,
    conversationId,
    userRequest,
    currentStep,
    status,
    context,
  });
}

// ============================================================
// ĐỌC
// ============================================================

export async function loadWorkState(userId, conversationId) {
  return getState(userId, conversationId);
}

// ============================================================
// CẬP NHẬT BƯỚC
// ============================================================

export async function moveToStep(userId, conversationId, currentStep, status) {
  return setStep(userId, conversationId, currentStep, status);
}

// ============================================================
// XÓA
// ============================================================

export async function clearWorkState(userId, conversationId) {
  return clearState(userId, conversationId);
}

export default {
  WORK_STATUS,
  WORK_STEP,
  saveWorkState,
  loadWorkState,
  moveToStep,
  clearWorkState,
};