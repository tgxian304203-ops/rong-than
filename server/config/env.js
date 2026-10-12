// server/config/env.js
// Nhiệm vụ: Đọc biến môi trường cho backend.
// Nếu thiếu biến bắt buộc, báo lỗi ngay khi khởi động.
// Không hard-code giá trị bí mật trong code.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Nạp file .env ở gốc server/
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// ============================================================
// ĐỌC BIẾN
// ============================================================

function read(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    return undefined;
  }
  return v;
}

function readNumber(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

// ============================================================
// BIẾN MÔI TRƯỜNG
// ============================================================

export const env = {
  // ----- Server -----
  NODE_ENV: read("NODE_ENV", "development"),
  PORT: readNumber("PORT", 3000),

  // ----- Database -----
  MONGODB_URI: read("MONGODB_URI", ""),
  MONGODB_DB_NAME: read("MONGODB_DB_NAME", "rong_than"),

  // ----- CORS -----
  // Danh sách domain cho phép, phân tách bằng dấu phẩy.
  // Ví dụ: http://localhost:5173,https://rong-than.onrender.com
  CORS_ORIGINS: read("CORS_ORIGINS", "http://localhost:5173"),

  // ----- Giới hạn upload -----
  MAX_UPLOAD_MB: readNumber("MAX_UPLOAD_MB", 20),

  // ----- Sandbox -----
  SANDBOX_TIMEOUT_MS: readNumber("SANDBOX_TIMEOUT_MS", 10000),

  // ----- Logging -----
  LOG_LEVEL: read("LOG_LEVEL", "info"), // debug | info | warn | error
  LOG_MAX_ITEMS: readNumber("LOG_MAX_ITEMS", 5000),
};

// ============================================================
// KIỂM TRA BẮT BUỘC
// ============================================================

export function validateEnv() {
  const errors = [];

  if (!env.MONGODB_URI) {
    errors.push("Thiếu MONGODB_URI trong server/.env");
  }

  if (errors.length > 0) {
    const msg = [
      "[Rồng Thần] Cấu hình môi trường không hợp lệ:",
      ...errors.map((e) => `  - ${e}`),
      "",
      "Tạo file server/.env dựa trên server/.env.example rồi điền giá trị.",
    ].join("\n");
    throw new Error(msg);
  }
}

// ============================================================
// TIỆN ÍCH
// ============================================================

export function getCorsOrigins() {
  return env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isProduction() {
  return env.NODE_ENV === "production";
}

export default env;