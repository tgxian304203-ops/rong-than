// src/api/models.js
// Nhiệm vụ: API dò/chọn model
// - Lấy model đang sử dụng (Đại Não / Tiểu Não)
// - Lấy danh sách model ứng viên
// - Đổi model đang sử dụng

import api from "./client.js";

// ============================================================
// TẦNG
// ============================================================
// "dai-nao" | "tieu-nao"

const VALID_TIERS = ["dai-nao", "tieu-nao"];

function assertTier(tier) {
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`Tầng không hợp lệ: ${tier}`);
  }
}

// ============================================================
// MODEL ĐANG SỬ DỤNG
// ============================================================

/**
 * @param {string} tier - "dai-nao" | "tieu-nao"
 * @param {string} taskType - loại nhiệm vụ (code, summary, research, ...)
 * @returns {Promise<{ activeModel: object, candidates: object[] }>}
 */
export async function getActiveModel(tier, taskType) {
  assertTier(tier);
  const q = taskType ? `?taskType=${encodeURIComponent(taskType)}` : "";
  return api.get(`/models/${tier}/active${q}`);
}

// ============================================================
// MODEL ỨNG VIÊN
// ============================================================

export async function listCandidates(tier, taskType) {
  assertTier(tier);
  const q = taskType ? `?taskType=${encodeURIComponent(taskType)}` : "";
  return api.get(`/models/${tier}/candidates${q}`);
}

// ============================================================
// ĐỔI MODEL ĐANG SỬ DỤNG
// ============================================================

export async function setActiveModel(tier, modelId, taskType) {
  assertTier(tier);
  return api.post(`/models/${tier}/active`, { modelId, taskType });
}

// ============================================================
// DÒ MODEL TỪ KEY (2 bước: đếm key, xác nhận quyền truy cập)
// ============================================================

/**
 * Bước 1 + 2 theo dự án:
 *   Bước 1: đếm số key đã dán
 *   Bước 2: xác nhận quyền truy cập model
 * @param {string} tier
 */
export async function scanModels(tier) {
  assertTier(tier);
  return api.post(`/models/${tier}/scan`, {});
}

// ============================================================
// HEALTH / KHẢ DỤNG
// ============================================================

export async function getModelHealth(tier) {
  assertTier(tier);
  return api.get(`/models/${tier}/health`);
}