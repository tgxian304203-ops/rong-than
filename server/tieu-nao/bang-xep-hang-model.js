// server/tieu-nao/bang-xep-hang-model.js
// Nhiệm vụ: Bảng điểm sức mạnh model Tiểu Não.

const RANK = {
  // ===== ỨNG CỬ VIÊN 1 =====
  "cohere/north-mini-code:free": 100,
  "gemini-3.8-flash": 98,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 96,
  "openai/gpt-oss-120b": 94,

  // ===== ỨNG CỬ VIÊN 2 =====
  "gemini-3.7-flash": 90,
  "gemini-3.6-flash": 88,
  "gemini-3.5-flash": 86,
  "gemini-3.5-flash-lite": 84,
  "gemini-2.5-flash": 83,
  "gemini-2.5-flash-lite": 80,

  "openai/gpt-oss-20b": 78,
  "qwen/qwen3.8-27b": 80,
  "openai/gpt-oss-safeguard-20b": 75,

  "poolside/laguna-s-2.1:free": 88,
  "inclusionai/ling-3.1-flash": 85,
  "thinkingmachines/inkling:free": 88,
  "nvidia/nemotron-3-super-120b-a12b:free": 85,
  "poolside/laguna-xs-2.1:free": 82,
  "google/gemma-4-31b-it:free": 80,
  "qwen/qwen3.8-27b:free": 80,
  "thinkingmachines/inkling-small:free": 82,
  "google/gemma-4-26b-a4b-it:free": 78,
  "nvidia/nemotron-3-nano-omni-30b-a3b:free": 76,
  "nvidia/nemotron-3.5-lightning:free": 78,
  "dots-studio/dots-3-note-preview:free": 72,
  "liquid/lfm-2.5-2.6b:free": 70,
  "apodex/apodex-1.1-mini:free": 70,
};

export function layDiemSucManh(modelName, taskType = null) {
  if (!modelName) return 0;
  return typeof RANK[modelName] === "number" ? RANK[modelName] : 60;
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

export default { layDiemSucManh, sapXepTheoSucManh };