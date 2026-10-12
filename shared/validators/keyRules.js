// shared/validators/keyRules.js
// Nhiệm vụ: Quy tắc kiểm tra API Key (chỉ dạng, không gọi mạng).
// Hỗ trợ Gemini cả prefix "AIza" (cũ) và "AQ." (mới).

import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_IDS,
} from "../constants/providers.js";
import {
  WEB_PROVIDERS,
  WEB_PROVIDER_IDS,
} from "../constants/webProviders.js";

// ============================================================
// QUY TẮC
// ============================================================

const KEY_RULES = [
  // Model providers
  ...MODEL_PROVIDER_IDS.map((id) => {
    const p = MODEL_PROVIDERS[id];
    const prefixes = Array.isArray(p.prefixes) ? p.prefixes : [p.prefix];
    return {
      provider: id,
      prefixes,
      prefix: prefixes[0], // để tương thích
      minLength: id === "gemini" ? 20 : 40,
      kind: "model",
    };
  }),
  // Web providers
  ...WEB_PROVIDER_IDS.map((id) => {
    const p = WEB_PROVIDERS[id];
    const prefixes = Array.isArray(p.prefixes) ? p.prefixes : [p.prefix];
    return {
      provider: id,
      prefixes,
      prefix: prefixes[0],
      minLength: id === "serpjet" ? 20 : 30,
      kind: "web",
    };
  }),
];

export const KEY_RULES_LIST = KEY_RULES;

// ============================================================
// NHẬN DIỆN
// ============================================================

export function detectProviderFromKey(key) {
  if (!key || typeof key !== "string") return null;
  const trimmed = key.trim();
  for (const rule of KEY_RULES) {
    if (rule.prefixes.some((p) => trimmed.startsWith(p))) {
      return rule.provider;
    }
  }
  return null;
}

export function detectKindFromKey(key) {
  if (!key || typeof key !== "string") return null;
  const trimmed = key.trim();
  for (const rule of KEY_RULES) {
    if (rule.prefixes.some((p) => trimmed.startsWith(p))) {
      return rule.kind;
    }
  }
  return null;
}

// ============================================================
// KIỂM TRA
// ============================================================

export function validateApiKeyFormat(key, opts = {}) {
  if (!key || typeof key !== "string") {
    return { ok: false, error: "API Key không được để trống" };
  }
  const trimmed = key.trim();

  if (trimmed.length < 10) {
    return { ok: false, error: "API Key quá ngắn, không hợp lệ" };
  }

  const provider = detectProviderFromKey(trimmed);
  if (!provider) {
    return {
      ok: false,
      error: "Không nhận diện được nhà cung cấp từ API Key",
    };
  }

  const rule = KEY_RULES.find((r) => r.provider === provider);

  if (opts.expectedKind && rule.kind !== opts.expectedKind) {
    return {
      ok: false,
      provider,
      kind: rule.kind,
      error: `Key này thuộc nhóm "${rule.kind}", không khớp nhóm "${opts.expectedKind}"`,
    };
  }

  if (opts.expectedProvider && provider !== opts.expectedProvider) {
    return {
      ok: false,
      provider,
      kind: rule.kind,
      error: `Key này thuộc "${provider}", không khớp "${opts.expectedProvider}"`,
    };
  }

  if (rule && trimmed.length < rule.minLength) {
    return {
      ok: false,
      provider,
      kind: rule.kind,
      error: `API Key của ${provider} có vẻ quá ngắn`,
    };
  }

  return { ok: true, provider, kind: rule.kind };
}

// ============================================================
// CHE KEY
// ============================================================

export function maskApiKey(key) {
  if (!key || typeof key !== "string") return "••••";
  const trimmed = key.trim();
  const provider = detectProviderFromKey(trimmed);
  const rule = KEY_RULES.find((r) => r.provider === provider);

  if (rule) {
    for (const p of rule.prefixes) {
      if (trimmed.startsWith(p)) return `${p}••••`;
    }
  }

  if (trimmed.length <= 4) return "••••";
  return `${trimmed.slice(0, 4)}••••`;
}

export default {
  KEY_RULES_LIST,
  detectProviderFromKey,
  detectKindFromKey,
  validateApiKeyFormat,
  maskApiKey,
};