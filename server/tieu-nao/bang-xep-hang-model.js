// server/tieu-nao/bang-xep-hang-model.js
// Nhiệm vụ: Bảng xếp hạng sức mạnh model cho Tiểu Não (lính).
//
// Điểm sức mạnh được đánh theo thứ tự ưu tiên:
//   - ỨNG CỬ VIÊN 1 (priority 1-3) → điểm cao nhất
//   - ỨNG CỬ VIÊN 2 (priority 10-21) → điểm thấp hơn
//
// Model không có trong bảng → trả về điểm mặc định 60.

// ============================================================
// ĐIỂM SỨC MẠNH THEO MODEL
// ============================================================

const RANK = {
  // ===== ỨNG CỬ VIÊN 1 =====
  "gemini-3.8-flash": 100,
  "thinking-machines/inkling:free": 98,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 96,

  // ===== ỨNG CỬ VIÊN 2 =====
  "gemini-3.6-flash": 92,
  "gemini-3.5-flash-lite": 90,
  "gemini-3.1-flash-lite": 88,
  "openai/gpt-oss-120b": 86,
  "openai/gpt-oss-20b": 82,
  "openai/gpt-oss-safeguard-20b": 80,
  "nvidia/nemotron-3.5-lightning:free": 78,
  "nvidia/nemotron-3-super-120b-a12b:free": 76,
  "thinking-machines/inkling-small:free": 74,
  "cohere/north-mini-code:free": 72,
  "poolside/laguna-xs-2.1:free": 70,
  "liquid/lfm2.5-2.6b:free": 68,
};

// ============================================================
// LẤY ĐIỂM
// ============================================================

export function layDiemSucManh(modelName, taskType = null) {
  if (!modelName) return 0;

  const rank = RANK[modelName];
  if (typeof rank === "number") return rank;

  return 60;
}

// ============================================================
// SẮP XẾP
// ============================================================

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