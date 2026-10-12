// server/routes/models.js
// Nhiệm vụ: API dò model, chọn model.
// Quy tắc dự án:
//   - Đại Não: dùng key Đại Não.
//   - Tiểu Não: dùng key Tiểu Não.
//   - Không dò/gọi chéo.

import express from "express";
import { doModel as daiNaoDoModel } from "../dai-nao/do-model.js";
import { doModel as tieuNaoDoModel } from "../tieu-nao/do-model.js";
import {
  layModelDangSuDung,
  lietKeModelDangSuDung,
  datModelDangSuDung,
} from "../dai-nao/model-dang-su-dung.js";
import {
  DAI_NAO_TASK,
  layDanhSachUngVien as layUngVienDaiNao,
} from "../dai-nao/danh-sach-ung-vien.js";
import {
  TIEU_NAO_TASK,
  layDanhSachUngVien as layUngVienTieuNao,
} from "../tieu-nao/danh-sach-ung-vien.js";
import { locUngVien as locUngVienDaiNao } from "../dai-nao/loc-ung-vien.js";
import { locUngVien as locUngVienTieuNao } from "../tieu-nao/loc-ung-vien.js";
import { logWarn } from "../logs/ghi-log.js";

const router = express.Router();

function getUserId(req) {
  const v = req.headers["x-user-id"];
  return v ? String(v) : null;
}

function isValidTier(tier) {
  return tier === "dai-nao" || tier === "tieu-nao";
}

// ============================================================
// DÒ MODEL
// ============================================================
// POST /api/models/:tier/scan
// ============================================================

router.post("/:tier/scan", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { tier } = req.params;
    if (!isValidTier(tier)) {
      return res.status(400).json({ ok: false, message: "Tầng không hợp lệ" });
    }

    const result =
      tier === "dai-nao"
        ? await daiNaoDoModel({ userId })
        : await tieuNaoDoModel({ userId });

    return res.json(result);
  } catch (err) {
    await logWarn("Lỗi scan model", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// LẤY MODEL ĐANG SỬ DỤNG
// ============================================================
// GET /api/models/:tier/active?taskType=...
// ============================================================

router.get("/:tier/active", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { tier } = req.params;
    if (!isValidTier(tier)) {
      return res.status(400).json({ ok: false, message: "Tầng không hợp lệ" });
    }

    const taskType = String(req.query.taskType || "");

    if (tier === "dai-nao") {
      if (!taskType) {
        const all = await lietKeModelDangSuDung();
        return res.json({ ok: true, active: all });
      }
      const active = await layModelDangSuDung(taskType);
      return res.json({ ok: true, activeModel: active });
    }

    // Tiểu Não: chưa có hàm lấy active riêng — trả về danh sách ứng viên
    const list = layUngVienTieuNao(taskType);
    return res.json({ ok: true, candidates: list });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// LẤY MODEL ỨNG VIÊN
// ============================================================
// GET /api/models/:tier/candidates?taskType=...
// ============================================================

router.get("/:tier/candidates", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { tier } = req.params;
    if (!isValidTier(tier)) {
      return res.status(400).json({ ok: false, message: "Tầng không hợp lệ" });
    }

    const taskType = String(req.query.taskType || "");

    let list = [];
    if (tier === "dai-nao") {
      list = taskType
        ? layUngVienDaiNao(taskType)
        : Object.values(DAI_NAO_TASK).flatMap((t) => layUngVienDaiNao(t));
    } else {
      list = taskType
        ? layUngVienTieuNao(taskType)
        : Object.values(TIEU_NAO_TASK).flatMap((t) => layUngVienTieuNao(t));
    }

    return res.json({ ok: true, candidates: list });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ĐẶT MODEL ĐANG SỬ DỤNG (chỉ Đại Não có hàm)
// ============================================================
// POST /api/models/:tier/active
// ============================================================

router.post("/:tier/active", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { tier } = req.params;
    if (!isValidTier(tier)) {
      return res.status(400).json({ ok: false, message: "Tầng không hợp lệ" });
    }

    const { modelId, taskType } = req.body || {};
    if (!modelId || !taskType) {
      return res.status(400).json({ ok: false, message: "Thiếu modelId hoặc taskType" });
    }

    if (tier === "dai-nao") {
      const ok = await datModelDangSuDung(taskType, String(modelId));
      return res.json({ ok });
    }

    // Tiểu Não hiện chưa có hàm đặt active — trả về lỗi rõ ràng
    return res.status(501).json({
      ok: false,
      message: "Chưa hỗ trợ đặt model Tiểu Não qua API",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// HEALTH
// ============================================================
// GET /api/models/:tier/health
// ============================================================

router.get("/:tier/health", async (req, res) => {
  try {
    const { tier } = req.params;
    if (!isValidTier(tier)) {
      return res.status(400).json({ ok: false, message: "Tầng không hợp lệ" });
    }
    const { listByTier } = await import("../db/modelHealth.js");
    const items = await listByTier(tier);
    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;