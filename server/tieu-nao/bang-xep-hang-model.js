// server/tieu-nao/bang-xep-hang-model.js
// Nhiệm vụ: Bảng xếp hạng sức mạnh model cho Tiểu Não (lính).
//
// Cập nhật định kỳ theo PHẦN 06 dự án.
// Model free thay đổi thường xuyên.

// ============================================================
// BẢNG XẾP HẠNG THEO NHIỆM VỤ
// ============================================================

// Viết code (write-code)
const WRITE_CODE_RANK = {
  // Chuyên code — hạng cao nhất
  "qwen/qwen3-coder:free": 100,
  "qwen/qwen3-coder-480b-a35b-instruct:free": 98,

  // Model mạnh đa dụng
  "openai/gpt-oss-120b": 92,
  "openai/gpt-oss-120b:free": 92,
  "deepseek/deepseek-v3.2:free": 88,
  "qwen/qwen3-235b-a22b:free": 86,
  "qwen/qwen3-32b:free": 80,

  // Model khác
  "openai/gpt-oss-20b": 75,
  "arcee-ai/trinity-mini:free": 85,
  "nvidia/nemotron-3-nano-30b-a3b:free": 78,
  "qwen/qwen3-next-80b-a3b-instruct:free": 80,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 70,
  "z-ai/glm-4.5-air:free": 72,
  "google/gemini-3.1-flash-lite": 82,
  "google/gemini-3-flash": 90,
  "llama-3.3-70b-versatile": 78,
  "llama-3.1-8b-instant": 55,
  "minimax/minimax-m2.5:free": 68,
};

// Sửa lỗi code (fix-code)
const FIX_CODE_RANK = {
  "qwen/qwen3-coder:free": 100,
  "qwen/qwen3-coder-480b-a35b-instruct:free": 98,
  "openai/gpt-oss-120b": 92,
  "openai/gpt-oss-120b:free": 92,
  "deepseek/deepseek-v3.2:free": 88,
  "qwen/qwen3-235b-a22b:free": 85,
  "openai/gpt-oss-20b": 75,
  "arcee-ai/trinity-mini:free": 85,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 78,
  "z-ai/glm-4.5-air:free": 72,
  "google/gemini-3.1-flash-lite": 82,
  "google/gemini-3-flash": 90,
  "llama-3.3-70b-versatile": 78,
  "llama-3.1-8b-instant": 55,
  "minimax/minimax-m2.5:free": 68,
};

// Phân tích code (analyze-code)
const ANALYZE_CODE_RANK = {
  "openai/gpt-oss-120b": 100,
  "openai/gpt-oss-120b:free": 100,
  "qwen/qwen3-coder:free": 95,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 88,
  "deepseek/deepseek-v3.2:free": 85,
  "google/gemini-3-flash": 92,
  "google/gemini-3.1-flash-lite": 85,
  "qwen/qwen3-235b-a22b:free": 82,
  "llama-3.3-70b-versatile": 80,
  "openai/gpt-oss-20b": 75,
  "arcee-ai/trinity-mini:free": 80,
  "llama-3.1-8b-instant": 55,
};

// Đọc tài liệu dài (read-long-doc)
const READ_LONG_DOC_RANK = {
  "qwen/qwen3.6-plus:free": 100,
  "qwen/qwen3-235b-a22b:free": 90,
  "moonshotai/kimi-k2-instruct": 88,
  "google/gemini-3-flash": 95,
  "google/gemini-3.1-flash-lite": 85,
  "openai/gpt-oss-120b": 82,
  "deepseek/deepseek-v3.2:free": 80,
  "llama-3.3-70b-versatile": 78,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 75,
  "openai/gpt-oss-20b": 70,
  "llama-3.1-8b-instant": 50,
};

// Tóm tắt (summary)
const SUMMARY_RANK = {
  "llama-3.3-70b-versatile": 100,
  "openai/gpt-oss-120b": 95,
  "openai/gpt-oss-120b:free": 95,
  "google/gemini-3.1-flash-lite": 92,
  "minimax/minimax-m2.5:free": 88,
  "google/gemini-3-flash": 90,
  "qwen/qwen3-235b-a22b:free": 85,
  "deepseek/deepseek-v3.2:free": 82,
  "moonshotai/kimi-k2-instruct": 80,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 78,
  "openai/gpt-oss-20b": 75,
  "llama-3.1-8b-instant": 55,
};

// Tra cứu thông tin (research)
const RESEARCH_RANK = {
  "meta-llama/llama-4-scout-17b-16e-instruct": 100,
  "minimax/minimax-m2.5:free": 90,
  "openai/gpt-oss-120b": 88,
  "openai/gpt-oss-120b:free": 88,
  "google/gemini-3.1-flash-lite": 85,
  "google/gemini-3-flash": 92,
  "llama-3.3-70b-versatile": 82,
  "qwen/qwen3-235b-a22b:free": 80,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 78,
  "openai/gpt-oss-20b": 72,
  "llama-3.1-8b-instant": 55,
};

// Tác vụ khối lượng lớn (bulk)
const BULK_RANK = {
  "google/gemini-3.1-flash-lite": 100,
  "llama-3.1-8b-instant": 90,
  "llama-3.3-70b-versatile": 85,
  "google/gemini-3-flash": 88,
  "openai/gpt-oss-120b": 80,
  "openai/gpt-oss-120b:free": 80,
  "openai/gpt-oss-20b": 75,
  "minimax/minimax-m2.5:free": 78,
  "meta-llama/llama-4-maverick-17b-128e-instruct": 72,
};

// ============================================================
// BẢNG THEO TASK
// ============================================================

const RANK_BY_TASK = {
  "write-code": WRITE_CODE_RANK,
  "fix-code": FIX_CODE_RANK,
  "analyze-code": ANALYZE_CODE_RANK,
  "read-long-doc": READ_LONG_DOC_RANK,
  summary: SUMMARY_RANK,
  research: RESEARCH_RANK,
  bulk: BULK_RANK,
};

// ============================================================
// LẤY ĐIỂM
// ============================================================

export function layDiemSucManh(modelName, taskType = null) {
  if (!modelName) return 0;

  if (taskType && RANK_BY_TASK[taskType]) {
    const rank = RANK_BY_TASK[taskType][modelName];
    if (typeof rank === "number") return rank;
  }

  for (const task of Object.keys(RANK_BY_TASK)) {
    const rank = RANK_BY_TASK[task][modelName];
    if (typeof rank === "number") return rank;
  }

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