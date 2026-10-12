// server/tieu-nao/danh-sach-ung-vien.js
// Nhiệm vụ: Danh sách model ứng viên của Tiểu Não.
// Khớp với bảng trong PHẦN 06:
//   | Viết code              | qwen/qwen3-coder:free | openai/gpt-oss-120b      | OpenRouter / Groq |
//   | Sửa lỗi code           | qwen/qwen3-coder:free | meta-llama/llama-4-maverick-17b-128e-instruct | OpenRouter / Groq |
//   | Phân tích code         | openai/gpt-oss-120b   | meta-llama/llama-4-maverick-17b-128e-instruct | Groq |
//   | Đọc tài liệu dài       | qwen/qwen3.6-plus:free | moonshotai/kimi-k2-instruct | OpenRouter / Groq |
//   | Tóm tắt                | llama-3.3-70b-versatile | minimax/minimax-m2.5:free | Groq / OpenRouter |
//   | Tra cứu thông tin      | meta-llama/llama-4-scout-17b-16e-instruct | minimax/minimax-m2.5:free | Groq / OpenRouter |
//   | Tác vụ khối lượng lớn  | gemini-3.5-flash-lite | llama-3.1-8b-instant      | Gemini / Groq |

// ============================================================
// LOẠI NHIỆM VỤ
// ============================================================

export const TIEU_NAO_TASK = {
  WRITE_CODE: "write-code",
  FIX_CODE: "fix-code",
  ANALYZE_CODE: "analyze-code",
  READ_LONG_DOC: "read-long-doc",
  SUMMARY: "summary",
  RESEARCH: "research",
  BULK: "bulk",
};

// ============================================================
// BẢNG ỨNG VIÊN THEO NHIỆM VỤ
// ============================================================

export const TIEU_NAO_CANDIDATES = {
  [TIEU_NAO_TASK.WRITE_CODE]: [
    { name: "qwen/qwen3-coder:free", provider: "openrouter", priority: 1 },
    { name: "openai/gpt-oss-120b", provider: "groq", priority: 2 },
  ],
  [TIEU_NAO_TASK.FIX_CODE]: [
    { name: "qwen/qwen3-coder:free", provider: "openrouter", priority: 1 },
    {
      name: "meta-llama/llama-4-maverick-17b-128e-instruct",
      provider: "groq",
      priority: 2,
    },
  ],
  [TIEU_NAO_TASK.ANALYZE_CODE]: [
    { name: "openai/gpt-oss-120b", provider: "groq", priority: 1 },
    {
      name: "meta-llama/llama-4-maverick-17b-128e-instruct",
      provider: "groq",
      priority: 2,
    },
  ],
  [TIEU_NAO_TASK.READ_LONG_DOC]: [
    { name: "qwen/qwen3.6-plus:free", provider: "openrouter", priority: 1 },
    { name: "moonshotai/kimi-k2-instruct", provider: "groq", priority: 2 },
  ],
  [TIEU_NAO_TASK.SUMMARY]: [
    { name: "llama-3.3-70b-versatile", provider: "groq", priority: 1 },
    { name: "minimax/minimax-m2.5:free", provider: "openrouter", priority: 2 },
  ],
  [TIEU_NAO_TASK.RESEARCH]: [
    {
      name: "meta-llama/llama-4-scout-17b-16e-instruct",
      provider: "groq",
      priority: 1,
    },
    { name: "minimax/minimax-m2.5:free", provider: "openrouter", priority: 2 },
  ],
  [TIEU_NAO_TASK.BULK]: [
    { name: "gemini-3.5-flash-lite", provider: "gemini", priority: 1 },
    { name: "llama-3.1-8b-instant", provider: "groq", priority: 2 },
  ],
};

// ============================================================
// LẤY
// ============================================================

export function layDanhSachUngVien(taskType) {
  return TIEU_NAO_CANDIDATES[taskType] || [];
}

export function layTatCaUngVien() {
  return { ...TIEU_NAO_CANDIDATES };
}

export default {
  TIEU_NAO_TASK,
  TIEU_NAO_CANDIDATES,
  layDanhSachUngVien,
  layTatCaUngVien,
};