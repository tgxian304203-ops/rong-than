// server/routes/keys.js
// Nhiệm vụ: API key cho Đại Não, Tiểu Não, Web.
// Quy tắc dự án (PHẦN 04, mục 11, 12, 13):
//   - Ô nhập + ▶ Run → kiểm tra key và thêm vào đúng nhóm
//   - Nhóm: GROQ / GEMINI / OPENROUTER (Đại Não, Tiểu Não)
//   - Nhóm: TAVILY / SERPJET / BRAVE SEARCH (Web)
//   - Key của Đại Não, Tiểu Não, Web ĐỘC LẬP nhau
//   - Xóa từng key bằng ×

import express from "express";
import {
  MODEL_PROVIDERS,
  WEB_PROVIDERS,
  detectModelProviderByPrefix,
  detectWebProviderByPrefix,
} from "../config/providers.js";
import {
  addKey as addDaiNaoKey,
  listKeys as listDaiNaoKeys,
  deleteKey as deleteDaiNaoKey,
} from "../db/daiNaoKeys.js";
import {
  addKey as addTieuNaoKey,
  listKeys as listTieuNaoKeys,
  deleteKey as deleteTieuNaoKey,
} from "../db/tieuNaoKeys.js";
import {
  addKey as addWebKey,
  listKeys as listWebKeys,
  deleteKey as deleteWebKey,
} from "../db/webKeys.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";
import tavily from "../web/tavily.js";
import serpjet from "../web/serpjet.js";
import brave from "../web/brave.js";
import { ghiThemKey, ghiXoaKey } from "../security/nhat-ky-bao-mat.js";
import { logWarn } from "../logs/ghi-log.js";

const router = express.Router();

const MODEL_MODULES = { groq, gemini, openrouter };
const WEB_MODULES = { tavily, serpjet, brave };

function getUserId(req) {
  const v = req.headers["x-user-id"];
  return v ? String(v) : null;
}

// ============================================================
// MASK KEY
// ============================================================

function maskKey(raw, provider) {
  if (!raw || typeof raw !== "string") return "••••";
  const cfg = MODEL_PROVIDERS[provider] || WEB_PROVIDERS[provider];
  const prefix = cfg?.prefix || "";
  if (prefix && raw.startsWith(prefix)) return `${prefix}••••`;
  if (raw.length <= 4) return "••••";
  return `${raw.slice(0, 4)}••••`;
}

// ============================================================
// KIỂM TRA + LƯU KEY
// ============================================================
// POST /api/keys/:group/verify
//   group = "dai-nao" | "tieu-nao" | "web"
// ============================================================

router.post("/:group/verify", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { group } = req.params;
    const { key: rawKey } = req.body || {};

    if (!["dai-nao", "tieu-nao", "web"].includes(group)) {
      return res.status(400).json({ ok: false, message: "Nhóm key không hợp lệ" });
    }
    if (!rawKey || typeof rawKey !== "string" || rawKey.trim().length < 10) {
      return res.status(400).json({ ok: false, message: "API Key quá ngắn" });
    }

    const trimmed = rawKey.trim();

    // ============== MODEL KEY (Đại Não / Tiểu Não) ==============
    if (group === "dai-nao" || group === "tieu-nao") {
      const provider = detectModelProviderByPrefix(trimmed);
      if (!provider) {
        return res
          .status(400)
          .json({ ok: false, message: "Không nhận diện được nhà cung cấp từ API Key" });
      }

      const mod = MODEL_MODULES[provider];
      const verifyRes = await mod.verifyKey(trimmed);
      if (!verifyRes.ok) {
        return res
          .status(400)
          .json({ ok: false, message: verifyRes.error || "Key không hợp lệ" });
      }

      const masked = maskKey(trimmed, provider);
      const addFn = group === "dai-nao" ? addDaiNaoKey : addTieuNaoKey;

      const item = await addFn({
        userId,
        provider,
        rawKey: trimmed,
        maskedKey: masked,
        quota: "ok",
      });

      await ghiThemKey(group, provider, userId, { provider });

      return res.json({
        ok: true,
        keyId: String(item._id),
        provider,
        maskedKey: masked,
        quota: "ok",
      });
    }

    // ============== WEB KEY ==============
    const provider = detectWebProviderByPrefix(trimmed);
    if (!provider) {
      return res
        .status(400)
        .json({ ok: false, message: "Không nhận diện được nhà cung cấp web từ API Key" });
    }

    const mod = WEB_MODULES[provider];
    const verifyRes = await mod.verifyKey(trimmed);
    if (!verifyRes.ok) {
      return res
        .status(400)
        .json({ ok: false, message: verifyRes.error || "Key không hợp lệ" });
    }

    const masked = maskKey(trimmed, provider);
    const item = await addWebKey({
      userId,
      provider,
      rawKey: trimmed,
      maskedKey: masked,
      quota: "ok",
    });

    await ghiThemKey("web", provider, userId, { provider });

    return res.json({
      ok: true,
      keyId: String(item._id),
      provider,
      maskedKey: masked,
      quota: "ok",
    });
  } catch (err) {
    await logWarn("Lỗi verify key", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// LẤY DANH SÁCH KEY
// ============================================================
// GET /api/keys/:group
// ============================================================

router.get("/:group", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { group } = req.params;
    if (!["dai-nao", "tieu-nao", "web"].includes(group)) {
      return res.status(400).json({ ok: false, message: "Nhóm key không hợp lệ" });
    }

    let items = [];
    if (group === "dai-nao") items = await listDaiNaoKeys(userId);
    else if (group === "tieu-nao") items = await listTieuNaoKeys(userId);
    else items = await listWebKeys(userId);

    // Nhóm theo provider
    const providers = {};

    if (group === "web") {
      providers.tavily = [];
      providers.serpjet = [];
      providers.brave = [];
    } else {
      providers.groq = [];
      providers.gemini = [];
      providers.openrouter = [];
    }

    for (const it of items) {
      if (!providers[it.provider]) providers[it.provider] = [];
      providers[it.provider].push({
        id: String(it._id),
        maskedKey: it.maskedKey,
        provider: it.provider,
        quota: it.quota || "ok",
        createdAt: it.createdAt,
        lastCheckedAt: it.lastCheckedAt,
      });
    }

    return res.json({ ok: true, providers });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// XÓA 1 KEY
// ============================================================
// DELETE /api/keys/:group/:keyId
// ============================================================

router.delete("/:group/:keyId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { group, keyId } = req.params;
    if (!["dai-nao", "tieu-nao", "web"].includes(group)) {
      return res.status(400).json({ ok: false, message: "Nhóm key không hợp lệ" });
    }

    let ok = false;
    if (group === "dai-nao") ok = await deleteDaiNaoKey(userId, keyId);
    else if (group === "tieu-nao") ok = await deleteTieuNaoKey(userId, keyId);
    else ok = await deleteWebKey(userId, keyId);

    if (!ok) return res.status(404).json({ ok: false, message: "Không tìm thấy key" });

    await ghiXoaKey(group, "unknown", userId, { keyId });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// KIỂM TRA QUOTA 1 KEY
// ============================================================
// POST /api/keys/:group/:keyId/check-quota
// ============================================================

router.post("/:group/:keyId/check-quota", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { group, keyId } = req.params;

    // Lấy key
    let keyDoc = null;
    if (group === "dai-nao") {
      const { getKey } = await import("../db/daiNaoKeys.js");
      keyDoc = await getKey(userId, keyId);
    } else if (group === "tieu-nao") {
      const { getKey } = await import("../db/tieuNaoKeys.js");
      keyDoc = await getKey(userId, keyId);
    } else if (group === "web") {
      const { getKey } = await import("../db/webKeys.js");
      keyDoc = await getKey(userId, keyId);
    } else {
      return res.status(400).json({ ok: false, message: "Nhóm key không hợp lệ" });
    }

    if (!keyDoc) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy key" });
    }

    // Kiểm tra qua provider
    let verifyRes = { ok: false };
    if (group === "web") {
      const mod = WEB_MODULES[keyDoc.provider];
      if (mod) verifyRes = await mod.verifyKey(keyDoc.rawKey);
    } else {
      const mod = MODEL_MODULES[keyDoc.provider];
      if (mod) verifyRes = await mod.verifyKey(keyDoc.rawKey);
    }

    const quota = verifyRes.ok ? "ok" : "out";

    // Cập nhật quota
    const updateQuota =
      group === "dai-nao"
        ? (await import("../db/daiNaoKeys.js")).updateQuota
        : group === "tieu-nao"
        ? (await import("../db/tieuNaoKeys.js")).updateQuota
        : (await import("../db/webKeys.js")).updateQuota;

    await updateQuota(keyId, quota);

    return res.json({ ok: true, quota });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;