// server/tieu-nao/danh-sach-ung-vien.js
// Nhiệm vụ: Danh sách model ứng viên của Tiểu Não (Lính).

import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";
import { listKeysByProvider } from "../db/tieuNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const MODULES = { groq, gemini, openrouter };

export const TIEU_NAO_TASK = {
  WRITE_CODE: "write-code",
  FIX_CODE: "fix-code",
  ANALYZE_CODE: "analyze-code",
  READ_LONG_DOC: "read-long-doc",
  SUMMARY: "summary",
  RESEARCH: "research",
  BULK: "bulk",
};

const UNG_CU_VIEN_1_VA_2 = [
  // ===== ỨNG CỬ VIÊN 1 (LÍNH chuyên code & xử lý) =====
  { name: "cohere/north-mini-code:free", provider: "openrouter", priority: 1 },
  { name: "gemini-3.8-flash", provider: "gemini", priority: 2 },
  { name: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter", priority: 3 },
  { name: "openai/gpt-oss-120b", provider: "groq", priority: 4 },

  // ===== ỨNG CỬ VIÊN 2 (Dự phòng) =====
  // Gemini
  { name: "gemini-3.7-flash", provider: "gemini", priority: 10 },
  { name: "gemini-3.6-flash", provider: "gemini", priority: 11 },
  { name: "gemini-3.5-flash", provider: "gemini", priority: 12 },
  { name: "gemini-3.5-flash-lite", provider: "gemini", priority: 13 },
  { name: "gemini-2.5-flash", provider: "gemini", priority: 14 },
  { name: "gemini-2.5-flash-lite", provider: "gemini", priority: 15 },

  // Groq
  { name: "openai/gpt-oss-20b", provider: "groq", priority: 20 },
  { name: "qwen/qwen3.8-27b", provider: "groq", priority: 21 },
  { name: "openai/gpt-oss-safeguard-20b", provider: "groq", priority: 22 },

  // OpenRouter
  { name: "poolside/laguna-s-2.1:free", provider: "openrouter", priority: 30 },
  { name: "inclusionai/ling-3.1-flash", provider: "openrouter", priority: 31 },
  { name: "thinkingmachines/inkling:free", provider: "openrouter", priority: 32 },
  { name: "nvidia/nemotron-3-super-120b-a12b:free", provider: "openrouter", priority: 33 },
  { name: "poolside/laguna-xs-2.1:free", provider: "openrouter", priority: 34 },
  { name: "thinkingmachines/inkling-small:free", provider: "openrouter", priority: 35 },
  { name: "nvidia/nemotron-3-nano-omni-30b-a3b:free", provider: "openrouter", priority: 36 },
  { name: "apodex/apodex-1.1-mini:free", provider: "openrouter", priority: 37 },
  { name: "nvidia/nemotron-3.5-lightning:free", provider: "openrouter", priority: 38 },
  { name: "dots-studio/dots-3-note-preview:free", provider: "openrouter", priority: 39 },
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

export async function doModelDongTuProvider({ userId, provider }) {
  const mod = MODULES[provider];
  if (!mod) return { ok: false, models: [], error: `Provider không hỗ trợ: ${provider}` };

  const keys = await listKeysByProvider(userId, provider);
  const usableKeys = keys.filter((k) => k.quota !== "out");
  if (usableKeys.length === 0) {
    return { ok: false, models: [], error: `Provider ${provider} không có key còn quota` };
  }

  const key = usableKeys[0];
  try {
    const res = await mod.verifyKey(key.rawKey);
    if (!res.ok) return { ok: false, models: [], error: res.error || `Dò model từ ${provider} thất bại` };
    const models = Array.isArray(res.models) ? res.models.filter(Boolean) : [];
    await logInfo("Tiểu Não: dò model động thành công", { userId, provider, count: models.length });
    return { ok: true, models };
  } catch (err) {
    await logWarn("Tiểu Não: dò model động lỗi", { userId, provider, error: err?.message || String(err) });
    return { ok: false, models: [], error: err?.message || "Lỗi không xác định" };
  }
}

export async function doTatCaModelDong({ userId }) {
  const allProviders = Object.keys(MODULES);
  const result = [];
  for (const provider of allProviders) {
    const res = await doModelDongTuProvider({ userId, provider });
    if (res.ok) {
      for (const name of res.models) result.push({ name, provider });
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