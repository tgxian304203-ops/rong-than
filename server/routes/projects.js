// server/routes/projects.js
// Nhiệm vụ: API dự án.
// Quy tắc dự án (PHẦN 04, mục 6, 7):
//   - Danh sách, tạo, mở, tìm kiếm, xóa dự án
//   - Tạo & quản lý cuộc trò chuyện trong dự án

import express from "express";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from "../db/projects.js";
import {
  createConversation,
  listConversationsByProject,
  deleteConversation,
  getConversation,
} from "../db/conversations.js";
import { logWarn } from "../logs/ghi-log.js";

const router = express.Router();

function getUserId(req) {
  const v = req.headers["x-user-id"];
  return v ? String(v) : null;
}

// ============================================================
// DANH SÁCH DỰ ÁN
// ============================================================

router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const search = String(req.query.search || "");
    const items = await listProjects(userId, { search });
    return res.json({ ok: true, items });
  } catch (err) {
    await logWarn("Lỗi listProjects", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// TẠO DỰ ÁN
// ============================================================

router.post("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { name, description = "" } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, message: "Tên dự án không được để trống" });
    }
    if (String(name).length > 80) {
      return res.status(400).json({ ok: false, message: "Tên dự án quá dài (tối đa 80 ký tự)" });
    }

    const project = await createProject({
      userId,
      name: String(name).trim(),
      description: String(description || ""),
    });
    return res.json({ ok: true, project });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// LẤY 1 DỰ ÁN
// ============================================================

router.get("/:projectId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId } = req.params;
    const project = await getProject(userId, projectId);
    if (!project) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy dự án" });
    }
    return res.json({ ok: true, project });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// CẬP NHẬT DỰ ÁN
// ============================================================

router.patch("/:projectId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId } = req.params;
    const { name, description } = req.body || {};
    const ok = await updateProject(userId, projectId, { name, description });
    if (!ok) return res.status(404).json({ ok: false, message: "Không cập nhật được" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// XÓA DỰ ÁN
// ============================================================

router.delete("/:projectId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId } = req.params;
    const ok = await deleteProject(userId, projectId);
    if (!ok) return res.status(404).json({ ok: false, message: "Không xóa được" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// CUỘC TRÒ CHUYỆN TRONG DỰ ÁN
// ============================================================

router.get("/:projectId/conversations", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId } = req.params;
    const project = await getProject(userId, projectId);
    if (!project) return res.status(404).json({ ok: false, message: "Không tìm thấy dự án" });

    const items = await listConversationsByProject(userId, projectId);
    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

router.post("/:projectId/conversations", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId } = req.params;
    const { title = null } = req.body || {};

    const project = await getProject(userId, projectId);
    if (!project) return res.status(404).json({ ok: false, message: "Không tìm thấy dự án" });

    const conversation = await createConversation({
      userId,
      projectId,
      title,
    });
    return res.json({ ok: true, conversation });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

router.delete("/:projectId/conversations/:conversationId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });

    const { projectId, conversationId } = req.params;

    // Kiểm tra hội thoại thuộc đúng dự án + user
    const convo = await getConversation(userId, conversationId);
    if (!convo) return res.status(404).json({ ok: false, message: "Không tìm thấy hội thoại" });
    if (String(convo.projectId) !== String(projectId)) {
      return res.status(400).json({ ok: false, message: "Hội thoại không thuộc dự án này" });
    }

    const ok = await deleteConversation(userId, conversationId);
    if (!ok) return res.status(500).json({ ok: false, message: "Không xóa được" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;