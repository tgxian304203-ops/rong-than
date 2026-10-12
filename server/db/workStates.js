// server/db/workStates.js
// Nhiệm vụ: Collection workStates — trạng thái công việc đang làm dở.
// Khi BOSS mới lên thay, phải đọc lại trạng thái này để biết:
//   - Yêu cầu User là gì
//   - Đang làm tới đâu
//   - Bước tiếp theo là gì

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function workStatesCol() {
  return col(COLLECTIONS.workStates);
}

// ============================================================
// TẠO / CẬP NHẬT
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.userRequest        - yêu cầu gốc của User
 * @param {string} p.currentStep        - đang ở bước nào
 * @param {string} p.status             - "pending" | "in_progress" | "waiting_boss" | "waiting_soldier" | "waiting_sandbox" | "done" | "error"
 * @param {object} [p.context]          - dữ liệu bổ sung
 */
export async function upsertState({
  userId,
  conversationId,
  userRequest,
  currentStep,
  status,
  context = {},
}) {
  const now = new Date();
  const res = await workStatesCol().updateOne(
    { userId, conversationId: String(conversationId) },
    {
      $set: {
        userId,
        conversationId: String(conversationId),
        userRequest,
        currentStep,
        status,
        context,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

// ============================================================
// ĐỌC
// ============================================================

export async function getState(userId, conversationId) {
  return workStatesCol().findOne({
    userId,
    conversationId: String(conversationId),
  });
}

export async function listByUser(userId) {
  return workStatesCol()
    .find({ userId })
    .sort({ updatedAt: -1 })
    .toArray();
}

// ============================================================
// CẬP NHẬT BƯỚC
// ============================================================

export async function setStep(userId, conversationId, currentStep, status) {
  const res = await workStatesCol().updateOne(
    { userId, conversationId: String(conversationId) },
    { $set: { currentStep, status, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function clearState(userId, conversationId) {
  const res = await workStatesCol().deleteOne({
    userId,
    conversationId: String(conversationId),
  });
  return res.deletedCount > 0;
}

// ============================================================
// TIỆN ÍCH
// ============================================================

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}