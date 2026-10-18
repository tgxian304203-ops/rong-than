// server/dai-nao/danh-sach-ung-vien.js
// Nhiệm vụ: Danh sách model ứng viên của Đại Não (BOSS).
// =========================================================
// [CẬP NHẬT 18/10/2026]: 
// - XÓA: Gemini 2.5 Pro (mất free), Gemini 3.1 Flash Lite (cũ).
// - XÓA: Toàn bộ Llama 3/4 của Groq (đã chết).
// - THÊM MỚI: Poolside Laguna S 2.1, Ling 3.1 Flash.
// - GIỮ LẠI: Gemma 4, Qwen 3.8, Nemotron.
// =========================================================

import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";
import { listKeysByProvider } from "../db/daiNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const MODULES = { groq, gemini, openrouter };

export const DAI_NAO_TASK = {
  CLASSIFY: "classify",
  SELECT_MODEL: "select-model",
  CALL_BOSS: "call-boss",
};

// =========================================================
// DANH SÁCH MODEL ĐÃ ĐƯỢC LÀM SẠCH
// =========================================================
const UNG_CU_VIEN_1_VA_2 = [
  // ===== ỨNG CỬ VIÊN 1 (BOSS mạnh nhất) =====
  { name: "gemini-3.8-flash", provider: "gemini", priority: 1 },
  { name: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter", priority: 2 },
  { name: "thinkingmachines/inkling:free", provider: "openrouter", priority: 3 },
  { name: "nvidia/nemotron-3-super-120b-a12b:free", provider: "openrouter", priority: 4 },

  // ===== ỨNG CỬ VIÊN 2 (Dự phòng) =====
  // Gemini (Đã xóa 2.5 Pro và 3.1 Lite)
  { name: "gemini-3.7-flash", provider: "gemini", priority: 10 },
  { name: "gemini-3.6-flash", provider: "gemini", priority: 11 },
  { name: "gemini-3.5-flash", provider: "gemini", priority: 12 },
  { name: "gemini-3.5-flash-lite", provider: "gemini", priority: 13 },
  { name: "gemini-2.5-flash", provider: "gemini", priority: 14 },
  { name: "gemini-2.5-flash-lite", provider: "gemini", priority: 15 },

  // Groq (Đã xóa toàn bộ Llama, Compound, Kimi)
  { name: "openai/gpt-oss-120b", provider: "groq", priority: 20 },
  { name: "openai/gpt-oss-20b", provider: "groq", priority: 21 },
  { name: "qwen/qwen3.8-27b", provider: "groq", priority: 22 },
  { name: "openai/gpt-oss-safeguard-20b", provider: "groq", priority: 23 },

  // OpenRouter (Đã xóa qwen3-coder, deepseek, Llama)
  { name: "cohere/north-mini-code:free", provider: "openrouter", priority: 30 },
  { name: "poolside/laguna-s-2.1:free", provider: "openrouter", priority: 31 }, // MỚI
  { name: "inclusionai/ling-3.1-flash", provider: "openrouter", priority: 32 }, // MỚI
  { name: "google/gemma-4-31b-it:free", provider: "openrouter", priority: 33 },
  { name: "poolside/laguna-xs-2.1:free", provider: "openrouter", priority: 34 },
  { name: "qwen/qwen3.8-27b:free", provider: "openrouter", priority: 35 },
  { name: "google/gemma-4-26b-a4b-it:free", provider: "openrouter", priority: 36 },
  { name: "thinkingmachines/inkling-small:free", provider: "openrouter", priority: 37 },
  { name: "nvidia/nemotron-3-nano-omni-30b-a3b:free", provider: "openrouter", priority: 38 },
  { name: "nvidia/nemotron-3.5-lightning:free", provider: "openrouter", priority: 39 },
  { name: "dots-studio/dots-3-note-preview:free", provider: "openrouter", priority: 40 },
  { name: "liquid/lfm-2.5-2.6b:free", provider: "openrouter", priority: 41 },
  { name: "apodex/apodex-1.1-mini:free", provider: "openrouter", priority: 42 },
];

export const DAI_NAO_CANDIDATES = {
  [DAI_NAO_TASK.CLASSIFY]: UNG_CU_VIEN_1_VA_2,
  [DAI_NAO_TASK.SELECT_MODEL]: UNG_CU_VIEN_1_VA_2,
  [DAI_NAO_TASK.CALL_BOSS]: UNG_CU_VIEN_1_VA_2,
};

export function layDanhSachUngVien(taskType) {
  return DAI_NAO_CANDIDATES[taskType] || [];
}

export function layTatCaUngVien() {
  return { ...DAI_NAO_CANDIDATES };
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
    await logInfo("Đại Não: dò model động thành công", { userId, provider, count: models.length });
    return { ok: true, models };
  } catch (err) {
    await logWarn("Đại Não: dò model động lỗi", { userId, provider, error: err?.message || String(err) });
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
  DAI_NAO_TASK,
  DAI_NAO_CANDIDATES,
  layDanhSachUngVien,
  layTatCaUngVien,
  doModelDongTuProvider,
  doTatCaModelDong,
};