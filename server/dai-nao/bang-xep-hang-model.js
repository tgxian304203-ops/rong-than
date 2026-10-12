// server/dai-nao/bang-xep-hang-model.js
// Nhiệm vụ: Bảng xếp hạng sức mạnh model cho Đại Não.
//
// Cập nhật định kỳ theo PHẦN 06 dự án.
// Model free thay đổi thường xuyên — bảng này cần rà lại mỗi tháng.

// ============================================================
// HẠNG SỨC MẠNH
// ============================================================
// 100 = cao nhất. Càng thấp càng yếu.

// ============================================================
// BẢNG XẾP HẠNG — THEO NHIỆM VỤ
// ============================================================

// Phân loại yêu cầu (classify)
const CLASSIFY_RANK = {
  "openai/gpt-oss-120b": 100,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 90,
  "llama-3.3-70b-versatile": 85,
  "openai/gpt-oss-20b": 70,
  "llama-3.1-8b-instant": 50,
};

// Chọn model theo loại (select-model)
const SELECT_MODEL_RANK = {
  "llama-3.3-70b-versatile": 100,
  "openai/gpt-oss-20b": 80,
  "openai/gpt-oss-120b": 95,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 85,
  "llama-3.1-8b-instant": 50,
};

// Gọi BOSS (call-boss)
const CALL_BOSS_RANK = {
  "openai/gpt-oss-120b": 100,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 90,
  "llama-3.3-70b-versatile": 85,
  "qwen/qwen3-235b-a22b:free": 88,
  "qwen/qwen3-32b:free": 75,
  "deepseek/deepseek-v3.2:free": 78,
  "google/gemini-3.1-flash-lite": 92,
  "google/gemini-3-flash": 95,
  "moonshotai/kimi-k2-instruct": 82,
  "nvidia/nemotron-3-super-120b-a12b:free": 85,
  "z-ai/glm-4.5-air:free": 78,
  "openai/gpt-oss-20b": 70,
  "llama-3.1-8b-instant": 50,
  "minimax/minimax-m2.5:free": 72,
  "meta-llama/llama-4-scout-17b-16e-instruct": 68,
  "google/gemma-3n-e4b-it:free": 60,
  "google/gemma-3-27b-it:free": 75,
};

// ============================================================
// BẢNG THEO TASK
// ============================================================

const RANK_BY_TASK = {
  classify: CLASSIFY_RANK,
  "select-model": SELECT_MODEL_RANK,
  "call-boss": CALL_BOSS_RANK,
};

// ============================================================
// LẤY ĐIỂM SỨC MẠNH
// ============================================================

/**
 * Lấy điểm sức mạnh của 1 model theo task.
 * Model không có trong bảng → trả về điểm mặc định 60.
 *
 * @param {string} modelName
 * @param {string} [taskType]
 * @returns {number}
 */
export function layDiemSucManh(modelName, taskType = null) {
  if (!modelName) return 0;

  // Nếu có taskType → tra bảng của task đó trước
  if (taskType && RANK_BY_TASK[taskType]) {
    const rank = RANK_BY_TASK[taskType][modelName];
    if (typeof rank === "number") return rank;
  }

  // Không có trong task cụ thể → tra tất cả bảng
  for (const task of Object.keys(RANK_BY_TASK)) {
    const rank = RANK_BY_TASK[task][modelName];
    if (typeof rank === "number") return rank;
  }

  // Không tìm thấy → mặc định trung bình
  return 60;
}

// ============================================================
// SẮP XẾP DANH SÁCH MODEL
// ============================================================

/**
 * Sắp xếp danh sách model theo điểm sức mạnh giảm dần.
 * Model cùng điểm → giữ nguyên thứ tự ban đầu.
 *
 * @param {Array} models - [{ name, provider, ... }]
 * @param {string} [taskType]
 * @returns {Array}
 */
export function sapXepTheoSucManh(models, taskType = null) {
  if (!Array.isArray(models) || models.length === 0) return [];

  const withScore = models.map((m, idx) => ({
    ...m,
    _score: layDiemSucManh(m.name, taskType),
    _originalIndex: idx,
  }));

  withScore.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return a._originalIndex - b._originalIndex;
  });

  return withScore.map(({ _score, _originalIndex, ...rest }) => rest);
}

export default {
  layDiemSucManh,
  sapXepTheoSucManh,
};