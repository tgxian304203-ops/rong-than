// server/dai-nao/danh-sach-ung-vien.js
// Nhiệm vụ: Danh sách model ứng viên của Đại Não.
// Hỗ trợ dò model động từ provider qua API /models khi bảng tĩnh hết.

import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";
import { listKeysByProvider } from "../db/daiNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// LOẠI NHIỆM VỤ
// ============================================================

export const DAI_NAO_TASK = {
  CLASSIFY: "classify",
  SELECT_MODEL: "select-model",
  CALL_BOSS: "call-boss",
};

// ============================================================
// BẢNG ỨNG VIÊN TĨNH
// ============================================================

export const DAI_NAO_CANDIDATES = {
  [DAI_NAO_TASK.CLASSIFY]: [
    { name: "openai/gpt-oss-120b", provider: "groq", priority: 1 },
    {
      name: "meta-llama/llama-4-maverick-17b-128e-instruct",
      provider: "groq",
      priority: 2,
    },
  ],
  [DAI_NAO_TASK.SELECT_MODEL]: [
    { name: "llama-3.3-70b-versatile", provider: "groq", priority: 1 },
    { name: "openai/gpt-oss-20b", provider: "groq", priority: 2 },
  ],
  [DAI_NAO_TASK.CALL_BOSS]: [
    { name: "openai/gpt-oss-120b", provider: "groq", priority: 1 },
    {
      name: "meta-llama/llama-4-maverick-17b-128e-instruct",
      provider: "groq",
      priority: 2,
    },
  ],
};

export function layDanhSachUngVien(taskType) {
  return DAI_NAO_CANDIDATES[taskType] || [];
}

export function layTatCaUngVien() {
  return { ...DAI_NAO_CANDIDATES };
}

// ============================================================
// DÒ MODEL ĐỘNG TỪ PROVIDER
// ============================================================
//
// Khi bảng tĩnh hết (tất cả model đều hết quota/lỗi):
//   - Gọi API /models của provider → lấy danh sách model ĐẦY ĐỦ.
//   - Trả về danh sách model động để thử tiếp.
//
// Không cache — gọi mỗi lần cần theo yêu cầu dự án.

/**
 * Dò model động từ 1 provider.
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.provider    - "groq" | "gemini" | "openrouter"
 * @returns {Promise<{ok: boolean, models: string[], error?: string}>}
 */
export async function doModelDongTuProvider({ userId, provider }) {
  const mod = MODULES[provider];
  if (!mod) {
    return { ok: false, models: [], error: `Provider không hỗ trợ: ${provider}` };
  }

  // Lấy key còn quota của provider này
  const keys = await listKeysByProvider(userId, provider);
  const usableKeys = keys.filter((k) => k.quota !== "out");

  if (usableKeys.length === 0) {
    return {
      ok: false,
      models: [],
      error: `Provider ${provider} không có key còn quota`,
    };
  }

  // Dùng key đầu tiên để dò
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

    await logInfo("Đại Não: dò model động thành công", {
      userId,
      provider,
      count: models.length,
    });

    return { ok: true, models };
  } catch (err) {
    await logWarn("Đại Não: dò model động lỗi", {
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

/**
 * Dò model động từ TẤT CẢ provider.
 * @param {object} p
 * @param {string} p.userId
 * @returns {Promise<Array<{ name: string, provider: string }>>}
 */
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
  DAI_NAO_TASK,
  DAI_NAO_CANDIDATES,
  layDanhSachUngVien,
  layTatCaUngVien,
  doModelDongTuProvider,
  doTatCaModelDong,
};