// src/utils/validate.js
// Nhiệm vụ: Kiểm tra dữ liệu đầu vào
// - ID tài khoản
// - Mật khẩu
// - API Key
// - Tên dự án
// - Tệp đính kèm

// ============================================================
// ID TÀI KHOẢN
// ============================================================
// Quy tắc: 4-32 ký tự, bắt đầu bằng chữ cái, chỉ chứa a-z 0-9 _ -
// Ví dụ hợp lệ: user_12345, dragon01, rong_than
const ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/;

export function validateUserId(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "ID không được để trống" };
  }
  const trimmed = id.trim();
  if (trimmed.length < 4) {
    return { ok: false, error: "ID phải có ít nhất 4 ký tự" };
  }
  if (trimmed.length > 32) {
    return { ok: false, error: "ID không được vượt quá 32 ký tự" };
  }
  if (!ID_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: "ID chỉ gồm chữ, số, dấu _ và -, phải bắt đầu bằng chữ cái",
    };
  }
  return { ok: true, value: trimmed };
}

// ============================================================
// MẬT KHẨU
// ============================================================
// Quy tắc: tối thiểu 6 ký tự
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;

export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { ok: false, error: "Mật khẩu không được để trống" };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, error: `Mật khẩu không được vượt quá ${PASSWORD_MAX} ký tự` };
  }
  return { ok: true, value: password };
}

export function validatePasswordConfirm(password, confirm) {
  if (password !== confirm) {
    return { ok: false, error: "Mật khẩu xác nhận không khớp" };
  }
  return { ok: true };
}

// ============================================================
// API KEY — nhận diện nhà cung cấp theo prefix
// ============================================================

const KEY_RULES = [
  { provider: "groq", prefix: "gsk_", minLength: 40 },
  { provider: "gemini", prefix: "AIza", minLength: 35 },
  { provider: "openrouter", prefix: "sk-or-", minLength: 40 },
  { provider: "tavily", prefix: "tvly-", minLength: 30 },
  { provider: "serpjet", prefix: "sj-", minLength: 20 },
  { provider: "brave", prefix: "BSA", minLength: 25 },
];

/**
 * Nhận diện nhà cung cấp từ API key (không kiểm tra qua mạng).
 * @param {string} key
 * @returns {string|null} tên provider hoặc null
 */
export function detectProviderFromKey(key) {
  if (!key || typeof key !== "string") return null;
  const trimmed = key.trim();

  for (const rule of KEY_RULES) {
    if (trimmed.startsWith(rule.prefix)) return rule.provider;
  }
  return null;
}

/**
 * Kiểm tra định dạng API key (chỉ dạng, không gọi mạng).
 * @param {string} key
 * @param {string} [expectedProvider] - nếu có, yêu cầu đúng provider
 * @returns {{ok: boolean, provider?: string, error?: string}}
 */
export function validateApiKeyFormat(key, expectedProvider) {
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

  if (expectedProvider && provider !== expectedProvider) {
    return {
      ok: false,
      provider,
      error: `Key này thuộc nhà cung cấp "${provider}", không khớp với "${expectedProvider}"`,
    };
  }

  const rule = KEY_RULES.find((r) => r.provider === provider);
  if (rule && trimmed.length < rule.minLength) {
    return {
      ok: false,
      provider,
      error: `API Key của ${provider} có vẻ quá ngắn`,
    };
  }

  return { ok: true, provider };
}

// ============================================================
// DỰ ÁN
// ============================================================

export function validateProjectName(name) {
  if (!name || typeof name !== "string") {
    return { ok: false, error: "Tên dự án không được để trống" };
  }
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { ok: false, error: "Tên dự án không được để trống" };
  }
  if (trimmed.length > 80) {
    return { ok: false, error: "Tên dự án không được vượt quá 80 ký tự" };
  }
  return { ok: true, value: trimmed };
}

// ============================================================
// TỆP ĐÍNH KÈM
// ============================================================

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
];

export function validateAttachment(file) {
  if (!file) {
    return { ok: false, error: "Tệp không hợp lệ" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "Tệp vượt quá 20 MB" };
  }
  return { ok: true };
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type && ALLOWED_IMAGE_TYPES.includes(file.type)) return true;
  const name = (file.name || "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|heic)$/.test(name);
}

// ============================================================
// TIN NHẮN
// ============================================================

export function isBlankMessage(text, attachments) {
  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasAttach = Array.isArray(attachments) && attachments.length > 0;
  return !hasText && !hasAttach;
}

// ============================================================
// URL — dùng cho link liên kết nội bộ
// ============================================================

export function isValidId(value) {
  return typeof value === "string" && value.length > 0;
}