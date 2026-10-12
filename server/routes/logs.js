// server/routes/logs.js
// Nhiệm vụ: API Rồng Thần Logs.
// Quy tắc dự án (PHẦN 04, mục 20):
//   - Đọc log thật từ backend
//   - Lọc theo mức, tìm kiếm
//   - Xóa log trong phạm vi backend cho phép
//   - Tải log .txt
//   - Không hiển thị thành công trước khi xử lý xong

import express from "express";
import {
  listLogs,
  clearLogs,
  countLogs,
} from "../db/systemLogs.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const router = express.Router();

// ============================================================
// ĐỌC LOGS
// ============================================================
// GET /api/logs?level=&search=&limit=&cursor=
// ============================================================

router.get("/", async (req, res) => {
  try {
    const level = String(req.query.level || "all");
    const search = String(req.query.search || "");
    const limit = Number(req.query.limit) || 200;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const items = await listLogs({ level, search, limit, cursor });

    // cursor tiếp theo = timestamp của item cuối cùng
    const nextCursor =
      items.length > 0 ? items[items.length - 1].timestamp?.toISOString?.() || null : null;

    return res.json({
      ok: true,
      items: items.map((it) => ({
        id: String(it._id),
        timestamp: it.timestamp,
        level: it.level,
        message: it.message,
        meta: it.meta || null,
      })),
      nextCursor,
    });
  } catch (err) {
    await logWarn("Lỗi /logs", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// TRẠNG THÁI SERVER
// ============================================================
// GET /api/logs/status
// ============================================================

router.get("/status", async (req, res) => {
  try {
    // Đếm log để chứng minh DB đang kết nối
    const total = await countLogs();
    return res.json({
      ok: true,
      status: "online",
      logCount: total,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      ok: true,
      status: "offline",
      error: err?.message || "Không truy cập được DB",
    });
  }
});

// ============================================================
// XÓA LOGS
// ============================================================
// POST /api/logs/clear
// ============================================================

router.post("/clear", async (req, res) => {
  try {
    const deleted = await clearLogs();
    await logInfo("Đã xóa log trong ứng dụng", { deleted });
    return res.json({ ok: true, deleted });
  } catch (err) {
    await logWarn("Lỗi xóa log", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// TẢI LOGS (.txt)
// ============================================================
// GET /api/logs/export?level=&search=&format=txt
// ============================================================

router.get("/export", async (req, res) => {
  try {
    const level = String(req.query.level || "all");
    const search = String(req.query.search || "");

    const items = await listLogs({ level, search, limit: 5000 });

    // Đảo lại theo thứ tự thời gian tăng dần
    const sorted = [...items].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const lines = sorted.map((it) => {
      const ts = it.timestamp ? new Date(it.timestamp).toISOString() : "";
      const lv = String(it.level || "info").toUpperCase();
      const msg = String(it.message || "");
      return `[${ts}] [${lv}] ${msg}`;
    });

    const content = lines.join("\n") + "\n";

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="rong-than-logs-${Date.now()}.txt"`
    );
    return res.send(content);
  } catch (err) {
    await logWarn("Lỗi export log", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;