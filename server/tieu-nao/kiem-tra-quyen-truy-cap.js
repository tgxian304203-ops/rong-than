// server/tieu-nao/kiem-tra-quyen-truy-cap.js
// Nhiệm vụ: Xác nhận quyền truy cập model — Bước 2 của quy trình dò model.
// Quy tắc dự án:
//   - Tiểu Não CHỈ dùng key của Tiểu Não.
//   - Không được dò/gọi model từ key Đại Não.

import { MODEL_PROVIDERS } from "../config/providers.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

// ============================================================
// MAP PROVIDER → MODULE
// ============================================================

const MODULES = { groq, gemini, openrouter };

// ============================================================
// KIỂM TRA QUYỀN TRUY CẬP
// ============================================================

/**
 * @param {object} p
 * @param {string} p.provider
 * @param {string} p.rawKey
 * @returns {Promise<{ok: boolean, models: string[], provider: string, error?: string}>}
 */
export async function kiemTraQuyenTruyCap({ provider, rawKey }) {
  const cfg = MODEL_PROVIDERS[provider];
  if (!cfg) {
    return {
      ok: false,
      provider,
      models: [],
      error: `Provider không hợp lệ: ${provider}`,
    };
  }

  const mod = MODULES[provider];
  if (!mod) {
    return {
      ok: false,
      provider,
      models: [],
      error: `Chưa hỗ trợ provider: ${provider}`,
    };
  }

  try {
    const res = await mod.verifyKey(rawKey);
    if (!res.ok) {
      return {
        ok: false,
        provider,
        models: [],
        error: res.error || "Key không hợp lệ",
      };
    }
    return {
      ok: true,
      provider,
      models: Array.isArray(res.models) ? res.models : [],
    };
  } catch (err) {
    return {
      ok: false,
      provider,
      models: [],
      error: err?.message || "Không kiểm tra được quyền truy cập",
    };
  }
}

// ============================================================
// KIỂM TRA MODEL CỤ THỂ CÓ TRONG DANH SÁCH KHÔNG
// ============================================================

export function hasModelAccess(availableModels, modelName) {
  if (!Array.isArray(availableModels) || !modelName) return false;
  return availableModels.some(
    (m) =>
      m === modelName ||
      m.endsWith("/" + modelName) ||
      m.endsWith(":" + modelName)
  );
}

export default {
  kiemTraQuyenTruyCap,
  hasModelAccess,
};