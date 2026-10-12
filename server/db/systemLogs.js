// server/db/systemLogs.js
// Nhiệm vụ: Collection systemLogs — log hệ thống.
// Các mức: INFO / WARN / ERROR / DEBUG.
// Hỗ trợ Rồng Thần Logs (tìm kiếm, lọc, xóa, tải .txt).

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";
import { LIMITS } from "../config/limits.js";

export function systemLogsCol() {
  return col(COLLECTIONS.systemLogs);
}

// ============================================================
// GHI LOG
// ============================================================

export async function addLog({ level = "info", message, meta = null }) {
  const doc = {
    level: String(level).toLowerCase(),
    message,
    meta,
    timestamp: new Date(),
  };
  const res = await systemLogsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

/**
 * @param {object} opts
 * @param {string} [opts.level]   - "all" | "info" | "warn" | "error" | "debug"
 * @param {string} [opts.search]
 * @param {number} [opts.limit]
 * @param {string} [opts.cursor]  - timestamp ISO để phân trang
 */
export async function listLogs({
  level = "all",
  search = "",
  limit = LIMITS.LOGS_DEFAULT_LIMIT,
  cursor = null,
} = {}) {
  const filter = {};

  if (level && level !== "all") {
    filter.level = level;
  }

  if (search && search.trim()) {
    filter.message = { $regex: search.trim(), $options: "i" };
  }

  if (cursor) {
    const d = new Date(cursor);
    if (!Number.isNaN(d.getTime())) {
      filter.timestamp = { $lt: d };
    }
  }

  const cappedLimit = Math.min(
    Math.max(1, limit),
    LIMITS.LOGS_MAX_LIMIT
  );

  const items = await systemLogsCol()
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(cappedLimit)
    .toArray();

  return items;
}

// ============================================================
// XÓA
// ============================================================

export async function clearLogs() {
  const res = await systemLogsCol().deleteMany({});
  return res.deletedCount;
}

// ============================================================
// ĐẾM
// ============================================================

export async function countLogs() {
  return systemLogsCol().countDocuments({});
}

// ============================================================
// TIỆN ÍCH
// ============================================================

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}