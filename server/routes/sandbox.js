// server/routes/sandbox.js
// Nhiệm vụ: API chạy kiểm chứng code.
// Quy tắc dự án (PHẦN 01, mục 10):
//   - BOSS kiểm tra chạy thử trên Sandbox.
//   - Đúng → trả kết quả cho Rồng Thần.
//   - Sai → viết format cho lính sửa.

import express from "express";
import { chayKiemThu } from "../sandbox/chay-kiem-thu.js";
import { getRun } from "../db/sandboxRuns.js";
import { listByConversation as listArtifacts } from "../db/codeArtifacts.js";
import { saveArtifact } from "../db/codeArtifacts.js";
import { logWarn } from "../logs/ghi-log.js";

const router = express.Router();

function getUserId(req) {
  const v = req.headers["x-user-id"];
  return v ? String(v) : null;
}

// ============================================================
// CHẠY KIỂM THỬ
// ============================================================
// POST /api/sandbox/run
// ============================================================

router.post("/run", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { language, code, testCode = "", input = "", timeoutMs } = req.body || {};
    if (!language || !code) {
      return res.status(400).json({ ok: false, message: "Thiếu language hoặc code" });
    }

    const conversationId = String(req.body.conversationId || "standalone");
    const result = await chayKiemThu({
      userId,
      conversationId,
      language: String(language),
      code: String(code),
      testCode: String(testCode || ""),
      stdin: String(input || ""),
    });

    return res.json({
      ok: result.ok,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      runId: result.runId,
      error: result.error,
    });
  } catch (err) {
    await logWarn("Lỗi /sandbox/run", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// LẤY 1 LẦN CHẠY
// ============================================================
// GET /api/sandbox/runs/:runId
// ============================================================

router.get("/runs/:runId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { runId } = req.params;
    const run = await getRun(runId);
    if (!run || run.userId !== userId) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy lần chạy" });
    }
    return res.json({ ok: true, run });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// PHIÊN BẢN CODE
// ============================================================
// GET /api/sandbox/artifacts?conversationId=...
// ============================================================

router.get("/artifacts", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const conversationId = String(req.query.conversationId || "");
    if (!conversationId) {
      return res.status(400).json({ ok: false, message: "Thiếu conversationId" });
    }
    const items = await listArtifacts(conversationId);
    // Lọc theo user
    const filtered = items.filter((x) => x.userId === userId);
    return res.json({ ok: true, items: filtered });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// LƯU PHIÊN BẢN CODE
// ============================================================
// POST /api/sandbox/artifacts
// ============================================================

router.post("/artifacts", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { conversationId, language, code, version } = req.body || {};
    if (!conversationId || !language || !code) {
      return res.status(400).json({ ok: false, message: "Thiếu dữ liệu" });
    }

    const artifact = await saveArtifact({
      userId,
      conversationId,
      language,
      code,
      version: Number(version) || 1,
    });

    return res.json({ ok: true, artifact });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;