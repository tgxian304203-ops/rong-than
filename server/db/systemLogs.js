// server/db/systemLogs.js
// Nhiệm vụ: Collection systemLogs — log hệ thống.

import { LIMITS } from "../config/limits.js";

const COL_NAME = "systemLogs";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function addLog({ level = "info", message, meta = null }) {
  const doc = {
    level: String(level).toLowerCase(),
    message,
    meta,
    timestamp: new Date(),
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listLogs({
  level = "all",
  search = "",
  limit = LIMITS.LOGS_DEFAULT_LIMIT,
  cursor = null,
} = {}) {
  const filter = {};

  if (level && level !== "all") filter.level = level;

  if (search && search.trim()) {
    filter.message = { $regex: search.trim(), $options: "i" };
  }

  if (cursor) {
    const d = new Date(cursor);
    if (!Number.isNaN(d.getTime())) {
      filter.timestamp = { $lt: d };
    }
  }

  const cappedLimit = Math.min(Math.max(1, limit), LIMITS.LOGS_MAX_LIMIT);

  return col()
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(cappedLimit)
    .toArray();
}

export async function clearLogs() {
  const res = await col().deleteMany({});
  return res.deletedCount;
}

export async function countLogs() {
  return col().countDocuments({});
}