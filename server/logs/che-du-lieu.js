// server/logs/che-du-lieu.js
// Nhiệm vụ: Che dữ liệu nhạy cảm trước khi ghi log.
// Quy tắc dự án:
//   - Không ghi key đầy đủ vào log
//   - Không ghi mật khẩu vào log
//   - Không ghi token vào log

// ============================================================
// CHE CHUỖI
// ============================================================

const PATTERNS = [
  { re: /gsk_[A-Za-z0-9]{20,}/g, to: "gsk_••••" },
  { re: /AIza[A-Za-z0-9_\-]{20,}/g, to: "AIza••••" },
  { re: /sk-or-[A-Za-z0-9\-]{20,}/g, to: "sk-or-••••" },
  { re: /tvly-[A-Za-z0-9]{20,}/g, to: "tvly-••••" },
  { re: /BSA[A-Za-z0-9_\-]{20,}/g, to: "BSA••••" },
  {
    re: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    to: "••••JWT••••",
  },
  { re: /Bearer\s+[A-Za-z0-9_\-\.]{10,}/gi, to: "Bearer ••••" },
];

export function maskString(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const p of PATTERNS) {
    out = out.replace(p.re, p.to);
  }
  return out;
}

// ============================================================
// CHE OBJECT
// ============================================================

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "rawKey",
  "apiKey",
  "key",
  "token",
  "authorization",
  "secret",
]);

export function maskObject(value, depth = 0) {
  if (depth > 6) return "[sâu quá]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return maskString(value);

  if (Array.isArray(value)) {
    return value.map((v) => maskObject(v, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = "••••";
      } else {
        out[k] = maskObject(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

export default {
  maskString,
  maskObject,
};