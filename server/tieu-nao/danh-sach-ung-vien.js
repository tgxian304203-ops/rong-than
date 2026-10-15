// server/tieu-nao/danh-sach-ung-vien.js
// Nhiệm vụ: Danh sách model ứng viên của Tiểu Não (lính).
// Gồm model ưu tiên + model phụ (dự phòng).
// Chỉ dò động khi HẾT tất cả model tĩnh + key.
//
// QUY TẮC DỰ ÁN:
//   - Tiểu Não CHỈ dùng key của Tiểu Não (tieuNaoKeys).
//   - KHÔNG dò/gọi model từ key Đại Não.

import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";
import { listKeysByProvider } from "../db/tieuNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const MODULES = { groq, gemini, openrouter };

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
// BẢNG ỨNG VIÊN TĨNH
//   - ỨNG CỬ VIÊN 1 (priority 1-3): gọi trước
//   - ỨNG CỬ VIÊN 2 (priority 10-21): gọi sau nếu ƯCV1 lỗi/hết quota
// ============================================================

const UNG_CU_VIEN_1_VA_2 = [
  // ===== ỨNG CỬ VIÊN 1 =====
  { name: "gemini-3.8-flash", provider: "gemini", priority: 1 },
  { name: "thinking-machines/inkling:free", provider: "openrouter", priority: 2 },
  { name: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter", priority: 3 },

  // ===== ỨNG CỬ VIÊN 2 =====
  { name: "gemini-3.6-flash", provider: "gemini", priority: 10 },
  { name: "gemini-3.5-flash-lite", provider: "gemini", priority: 11 },
  { name: "gemini-3.1-flash-lite", provider: "gemini", priority: 12 },
  { name: "openai/gpt-oss-120b", provider: "groq", priority: 13 },
  { name: "openai/gpt-oss-20b", provider: "groq", priority: 14 },
  { name: "openai/gpt-oss-safeguard-20b", provider: "groq", priority: 15 },
  { name: "nvidia/nemotron-3.5-lightning:free", provider: "openrouter", priority: 16 },
  { name: "nvidia/nemotron-3-super-120b-a12b:free", provider: "openrouter", priority: 17 },
  { name: "thinking-machines/inkling-small:free", provider: "openrouter", priority: 18 },
  { name: "cohere/north-mini-code:free", provider: "openrouter", priority: 19 },
  { name: "poolside/laguna-xs-2.1:free", provider: "openrouter", priority: 20 },
  { name: "liquid/lfm2.5-2.6b:free", provider: "openrouter", priority: 21 },
];

export const TIEU_NAO_CANDIDATES = {
  [TIEU_NAO_TASK.WRITE_CODE]: UNG_CU_VIEN_1_VA_2,
  [TIEU_NAO_TASK.FIX_CODE]: UNG_CU_VIEN_1_VA_2,
  [TIEU_NAO_TASK.ANALYZE_CODE]: UNG_CU_VIEN_1_VA_2,
  [TIEU_NAO_TASK.READ_LONG_DOC]: UNG_CU_VIEN_1_VA_2,
  [TIEU_NAO_TASK.SUMMARY]: UNG_CU_VIEN_1_VA_2,
  [TIEU_NAO_TASK.RESEARCH]: UNG_CU_VIEN_1_VA_2,
  [TIEU_NAO_TASK.BULK]: UNG_CU_VIEN_1_VA_2,
};

export function layDanhSachUngVien(taskType) {
  return TIEU_NAO_CANDIDATES[taskType] || [];
}

export function layTatCaUngVien() {
  return { ...TIEU_NAO_CANDIDATES };
}

// ============================================================
// DÒ MODEL ĐỘNG
// ============================================================

export async function doModelDongTuProvider({ userId, provider }) {
  const mod = MODULES[provider];
  if (!mod) {
    return {
      ok: false,
      models: [],
      error: `Provider không hỗ trợ: ${provider}`,
    };
  }

  const keys = await listKeysByProvider(userId, provider);
  const usableKeys = keys.filter((k) => k.quota !== "out");

  if (usableKeys.length === 0) {
    return {
      ok: false,
      models: [],
      error: `Provider ${provider} không có key còn quota`,
    };
  }

  const key = usableKeys[0];

  try {
    const res = await mod.verifyKey(key.rawKey);
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        error: res.error || `Dò model từ ${provider} thất bại`,
      };
    }

    const models = Array.isArray(res.models) ? res.models.filter(Boolean) : [];

    await logInfo("Tiểu Não: dò model động thành công", {
      userId,
      provider,
      count: models.length,
    });

    return { ok: true, models };
  } catch (err) {
    await logWarn("Tiểu Não: dò model động lỗi", {
      userId,
      provider,
      error: err?.message || String(err),
    });
    return {
      ok: false,
      models: [],
      error: err?.message || "Lỗi không xác định",
    };
  }
}

export async function doTatCaModelDong({ userId }) {
  const allProviders = Object.keys(MODULES);
  const result = [];

  for (const provider of allProviders) {
    const res = await doModelDongTuProvider({ userId, provider });
    if (res.ok) {
      for (const name of res.models) {
        result.push({ name, provider });
      }
    }
  }

  return result;
}

export default {
  TIEU_NAO_TASK,
  TIEU_NAO_CANDIDATES,
  layDanhSachUngVien,
  layTatCaUngVien,
  doModelDongTuProvider,
  doTatCaModelDong,
};