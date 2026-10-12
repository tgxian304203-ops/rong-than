// server/dai-nao/danh-sach-ung-vien.js
// Nhiệm vụ: Danh sách model ứng viên của Đại Não.
// Khớp với bảng trong PHẦN 06:
//   | Vai trò             | Ưu tiên 1                                | Ưu tiên 2                                       | Nhà CC |
//   | Phân loại yêu cầu   | openai/gpt-oss-120b                      | meta-llama/llama-4-maverick-17b-128e-instruct   | Groq   |
//   | Chọn model theo loại| llama-3.3-70b-versatile                  | openai/gpt-oss-20b                              | Groq   |
//   | Gọi BOSS mới        | openai/gpt-oss-120b                      | meta-llama/llama-4-maverick-17b-128e-instruct   | Groq   |

// ============================================================
// LOẠI NHIỆM VỤ
// ============================================================

export const DAI_NAO_TASK = {
  CLASSIFY: "classify",        // phân loại yêu cầu User
  SELECT_MODEL: "select-model", // chọn model theo loại
  CALL_BOSS: "call-boss",      // gọi BOSS
};

// ============================================================
// BẢNG ỨNG VIÊN
// ============================================================

export const DAI_NAO_CANDIDATES = {
  [DAI_NAO_TASK.CLASSIFY]: [
    {
      name: "openai/gpt-oss-120b",
      provider: "groq",
      priority: 1,
    },
    {
      name: "meta-llama/llama-4-maverick-17b-128e-instruct",
      provider: "groq",
      priority: 2,
    },
  ],
  [DAI_NAO_TASK.SELECT_MODEL]: [
    {
      name: "llama-3.3-70b-versatile",
      provider: "groq",
      priority: 1,
    },
    {
      name: "openai/gpt-oss-20b",
      provider: "groq",
      priority: 2,
    },
  ],
  [DAI_NAO_TASK.CALL_BOSS]: [
    {
      name: "openai/gpt-oss-120b",
      provider: "groq",
      priority: 1,
    },
    {
      name: "meta-llama/llama-4-maverick-17b-128e-instruct",
      provider: "groq",
      priority: 2,
    },
  ],
};

// ============================================================
// LẤY DANH SÁCH
// ============================================================

export function layDanhSachUngVien(taskType) {
  return DAI_NAO_CANDIDATES[taskType] || [];
}

export function layTatCaUngVien() {
  return { ...DAI_NAO_CANDIDATES };
}

export default {
  DAI_NAO_TASK,
  DAI_NAO_CANDIDATES,
  layDanhSachUngVien,
  layTatCaUngVien,
};