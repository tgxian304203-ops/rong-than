// server/dai-nao/bang-xep-hang-model.js
// Nhiệm vụ: Bảng xếp hạng sức mạnh model cho Đại Não.
//
// Điểm sức mạnh:
//   - ỨNG CỬ VIÊN 1 (priority 1-4) → 90-100
//   - ỨNG CỬ VIÊN 2 (priority 10+) → 60-89
//
// Model không có trong bảng → 60.

const RANK = {
  // ===== ỨNG CỬ VIÊN 1 =====
  "nvidia/nemotron-3-ultra-550b-a55b:free": 100,
  "gemini-3.8-flash": 98,
  "nvidia/nemotron-3-super-120b-a12b:free": 95,
  "thinking-machines/inkling:free": 92,

  // ===== ỨNG CỬ VIÊN 2 =====
  // Gemini
  "gemini-3.6-flash": 88,
  "gemini-3.5-flash": 86,
  "gemini-3.5-flash-lite": 84,
  "gemini-3.1-flash-lite": 82,
  "gemini-2.5-pro": 85,
  "gemini-2.5-flash": 83,
  "gemini-2.5-flash-lite": 80,

  // Groq
  "openai/gpt-oss-120b": 85,
  "openai/gpt-oss-20b": 78,
  "llama-3.3-70b-versatile": 80,
  "llama-4-maverick-17b-128e-instruct": 82,
  "llama-4-scout-instruct": 78,
  "llama-3.1-8b-instant": 65,
  "moonshotai/kimi-k2-instruct": 84,
  "qwen/qwen3.8-27b": 80,
  "groq/compound": 82,
  "groq/compound-mini": 76,

  // OpenRouter
  "cohere/north-mini-code:free": 82,
  "poolside/laguna-xs-2.1:free": 80,
  "qwen/qwen3-coder:free": 85,
  "liquid/lfm-2.5-2.6b:free": 70,
  "google/gemma-4-26b-a4b-it:free": 78,
  "google/gemma-4-31b-it:free": 80,
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": 76,
  "nvidia/nemotron-3.5-lightning:free": 82,
  "nvidia/nemotron-3.5-content-safety:free": 68,
  "apodex/apodex-1.1-mini:free": 70,
  "dots-studio/dots-3-note-preview:free": 65,
  "inclusionai/ling-3.0-flash-sante:free": 72,
  "poolside/laguna-s-2.1:free": 78,
  "qwen/qwen3.8-27b:free": 80,
  "thinkingmachines/inkling-small:free": 82,
};

export function layDiemSucManh(modelName, taskType = null) {
  if (!modelName) return 0;
  const rank = RANK[modelName];
  if (typeof rank === "number") return rank;
  return 60;
}

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