// server/security/ma-hoa-key.js
// Nhiệm vụ: Mã hóa API Key trước khi lưu vào MongoDB.
// Dùng AES-256-GCM với khóa suy ra từ biến môi trường.
//
// LƯU Ý:
//   - Khóa bí mật KEY_ENCRYPTION_SECRET phải có trong server/.env.
//   - Nếu chưa có, hàm sẽ báo lỗi rõ ràng (không tự tạo khóa mới).
//   - Chỉ mã hóa khi lưu trữ; khi dùng thì giải mã.

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // 32 bytes = 256 bit
const IV_LEN = 12;  // GCM khuyến nghị 12 bytes
const SALT = "rong-than-key-salt-v1";

// ============================================================
// SUY RA KHÓA TỪ SECRET
// ============================================================

function getSecret() {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "[Rồng Thần][security] Thiếu KEY_ENCRYPTION_SECRET (>=16 ký tự) trong server/.env"
    );
  }
  return secret;
}

function deriveKey() {
  const secret = getSecret();
  return crypto.scryptSync(secret, SALT, KEY_LEN);
}

// ============================================================
// MÃ HÓA
// ============================================================

/**
 * @param {string} plain
 * @returns {string} chuỗi base64 dạng: iv.authTag.cipher
 */
export function encryptKey(plain) {
  if (typeof plain !== "string") {
    throw new Error("encryptKey yêu cầu chuỗi đầu vào");
  }
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

// ============================================================
// GIẢI MÃ
// ============================================================

/**
 * @param {string} payload  - chuỗi do encryptKey trả về
 * @returns {string} plain gốc
 */
export function decryptKey(payload) {
  if (typeof payload !== "string" || !payload.includes(".")) {
    throw new Error("decryptKey: payload không hợp lệ");
  }
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("decryptKey: payload thiếu thành phần");
  }

  const key = deriveKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return out.toString("utf8");
}

export default {
  encryptKey,
  decryptKey,
};