// server/dai-nao/bang-xep-hang-model.js
// Nhiệm vụ: Bảng điểm sức mạnh model Đại Não.

const RANK = {
  // ===== ỨNG CỬ VIÊN 1 =====
  "gemini-3.8-flash": 100,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 98,
  "thinkingmachines/inkling:free": 95,
  "nvidia/nemotron-3-super-120b-a12b:free": 92,

  // ===== ỨNG CỬ VIÊN 2 =====
  "gemini-3.7-flash": 90,
  "gemini-3.6-flash": 88,
  "gemini-3.5-flash": 86,
  "gemini-3.5-flash-lite": 84,
  "gemini-2.5-flash": 83,
  "gemini-2.5-flash-lite": 80,

  "openai/gpt-oss-120b": 85,
  "openai/gpt-oss-20b": 78,
  "qwen/qwen3.8-27b": 80,
  "openai/gpt-oss-safeguard-20b": 75,

  "cohere/north-mini-code:free": 82,
  "poolside/laguna-s-2.1:free": 85,
  "inclusionai/ling-3.1-flash": 82,
  "poolside/laguna-xs-2.1:free": 80,
  "thinkingmachines/inkling-small:free": 82,
  "nvidia/nemotron-3-nano-omni-30b-a3b:free": 76,
  "apodex/apodex-1.1-mini:free": 70,
  "nvidia/nemotron-3.5-lightning:free": 78,
  "dots-studio/dots-3-note-preview:free": 72,
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