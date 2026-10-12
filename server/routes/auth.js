// server/routes/auth.js
// Nhiệm vụ: API xác thực & tài khoản.
// Theo yêu cầu dự án: đăng nhập trực tiếp trên giao diện,
// lưu mật khẩu thẳng vào MongoDB, KHÔNG JWT, KHÔNG hash.

import express from "express";
import {
  createUser,
  findByUserId,
  updateUserId,
  updatePassword,
  deleteUser,
} from "../db/users.js";
import {
  deleteProjectsByUser,
} from "../db/projects.js";
import {
  deleteConversationsByUser,
} from "../db/conversations.js";
import {
  deleteKeysByUser as deleteDaiNaoKeysByUser,
} from "../db/daiNaoKeys.js";
import {
  deleteKeysByUser as deleteTieuNaoKeysByUser,
} from "../db/tieuNaoKeys.js";
import {
  deleteKeysByUser as deleteWebKeysByUser,
} from "../db/webKeys.js";
import { deleteSettings } from "../db/settings.js";
import {
  ghiDangKy,
  ghiDangNhapThanhCong,
  ghiDangNhapThatBai,
  ghiDoiId,
  ghiDoiMatKhau,
  ghiXoaTaiKhoan,
} from "../security/nhat-ky-bao-mat.js";
import { logWarn } from "../logs/ghi-log.js";

const router = express.Router();

// ============================================================
// HELPER
// ============================================================

function validateUserId(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "ID không được để trống" };
  }
  const t = id.trim();
  if (t.length < 4) return { ok: false, error: "ID phải có ít nhất 4 ký tự" };
  if (t.length > 32) return { ok: false, error: "ID không vượt quá 32 ký tự" };
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/.test(t)) {
    return {
      ok: false,
      error: "ID chỉ gồm chữ, số, dấu _ và -, phải bắt đầu bằng chữ cái",
    };
  }
  return { ok: true, value: t };
}

function validatePassword(pwd) {
  if (!pwd || typeof pwd !== "string") {
    return { ok: false, error: "Mật khẩu không được để trống" };
  }
  if (pwd.length < 6) return { ok: false, error: "Mật khẩu phải từ 6 ký tự" };
  if (pwd.length > 128) return { ok: false, error: "Mật khẩu quá dài" };
  return { ok: true, value: pwd };
}

// ============================================================
// ĐĂNG KÝ
// ============================================================

router.post("/register", async (req, res) => {
  try {
    const { userId, password, confirmPassword } = req.body || {};

    const idCheck = validateUserId(userId);
    if (!idCheck.ok) {
      return res.status(400).json({ ok: false, code: "BAD_ID", message: idCheck.error });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return res.status(400).json({ ok: false, code: "BAD_PASSWORD", message: pwCheck.error });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ ok: false, code: "PWD_MISMATCH", message: "Mật khẩu xác nhận không khớp" });
    }

    const exists = await findByUserId(idCheck.value);
    if (exists) {
      return res
        .status(409)
        .json({ ok: false, code: "ID_TAKEN", message: "ID này đã được sử dụng" });
    }

    const user = await createUser({
      userId: idCheck.value,
      password: pwCheck.value,
    });

    await ghiDangKy(idCheck.value, { ip: req.ip });

    return res.json({
      ok: true,
      user: { userId: user.userId },
    });
  } catch (err) {
    await logWarn("Lỗi đăng ký", { error: err?.message || String(err) });
    return res
      .status(500)
      .json({ ok: false, code: "SERVER_ERROR", message: "Lỗi server" });
  }
});

// ============================================================
// ĐĂNG NHẬP
// ============================================================

router.post("/login", async (req, res) => {
  try {
    const { userId, password } = req.body || {};

    const idCheck = validateUserId(userId);
    if (!idCheck.ok) {
      return res.status(400).json({ ok: false, code: "BAD_ID", message: idCheck.error });
    }
    if (!password || typeof password !== "string") {
      return res
        .status(400)
        .json({ ok: false, code: "BAD_PASSWORD", message: "Thiếu mật khẩu" });
    }

    const user = await findByUserId(idCheck.value);
    if (!user || user.password !== password) {
      await ghiDangNhapThatBai(idCheck.value, { ip: req.ip });
      return res
        .status(401)
        .json({ ok: false, code: "INVALID_CREDS", message: "ID hoặc mật khẩu không đúng" });
    }

    await ghiDangNhapThanhCong(idCheck.value, { ip: req.ip });

    return res.json({
      ok: true,
      user: { userId: user.userId },
    });
  } catch (err) {
    await logWarn("Lỗi đăng nhập", { error: err?.message || String(err) });
    return res
      .status(500)
      .json({ ok: false, code: "SERVER_ERROR", message: "Lỗi server" });
  }
});

// ============================================================
// ĐĂNG XUẤT
// ============================================================

router.post("/logout", async (req, res) => {
  // Không có session/token → không cần làm gì backend.
  // Frontend tự xóa trạng thái đăng nhập.
  return res.json({ ok: true });
});

// ============================================================
// ME
// ============================================================

router.get("/me", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, code: "NO_USER", message: "Chưa đăng nhập" });
    }
    const user = await findByUserId(String(userId));
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, code: "NOT_FOUND", message: "Không tìm thấy tài khoản" });
    }
    return res.json({ ok: true, user: { userId: user.userId } });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, code: "SERVER_ERROR", message: "Lỗi server" });
  }
});

// ============================================================
// ĐỔI ID
// ============================================================

router.post("/change-id", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    }

    const { currentPassword, newUserId } = req.body || {};
    if (!currentPassword || typeof currentPassword !== "string") {
      return res
        .status(400)
        .json({ ok: false, code: "NO_PASSWORD", message: "Thiếu mật khẩu hiện tại" });
    }

    const idCheck = validateUserId(newUserId);
    if (!idCheck.ok) {
      return res.status(400).json({ ok: false, code: "BAD_ID", message: idCheck.error });
    }

    const user = await findByUserId(String(userId));
    if (!user) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy tài khoản" });
    }
    if (user.password !== currentPassword) {
      return res
        .status(401)
        .json({ ok: false, code: "INVALID_CREDS", message: "Mật khẩu hiện tại không đúng" });
    }

    const taken = await findByUserId(idCheck.value);
    if (taken && taken.userId !== user.userId) {
      return res
        .status(409)
        .json({ ok: false, code: "ID_TAKEN", message: "ID mới đã được sử dụng" });
    }

    const ok = await updateUserId(user.userId, idCheck.value);
    if (!ok) {
      return res.status(500).json({ ok: false, message: "Không cập nhật được ID" });
    }

    await ghiDoiId(user.userId, idCheck.value, { ip: req.ip });

    return res.json({ ok: true, user: { userId: idCheck.value } });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// ĐỔI MẬT KHẨU
// ============================================================

router.post("/change-password", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || typeof currentPassword !== "string") {
      return res
        .status(400)
        .json({ ok: false, code: "NO_PASSWORD", message: "Thiếu mật khẩu hiện tại" });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) {
      return res.status(400).json({ ok: false, code: "BAD_PASSWORD", message: pwCheck.error });
    }
    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ ok: false, code: "PWD_MISMATCH", message: "Mật khẩu xác nhận không khớp" });
    }

    const user = await findByUserId(String(userId));
    if (!user) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy tài khoản" });
    }
    if (user.password !== currentPassword) {
      return res
        .status(401)
        .json({ ok: false, code: "INVALID_CREDS", message: "Mật khẩu hiện tại không đúng" });
    }

    const ok = await updatePassword(user.userId, newPassword);
    if (!ok) {
      return res.status(500).json({ ok: false, message: "Không cập nhật được mật khẩu" });
    }

    await ghiDoiMatKhau(user.userId, { ip: req.ip });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

// ============================================================
// XÓA TÀI KHOẢN
// ============================================================

router.post("/delete-account", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
    }

    const { currentPassword, confirmText } = req.body || {};
    if (String(confirmText || "").trim().toUpperCase() !== "XOA") {
      return res
        .status(400)
        .json({ ok: false, code: "BAD_CONFIRM", message: 'Phải nhập "XOA" để xác nhận' });
    }

    const user = await findByUserId(String(userId));
    if (!user) {
      return res.status(404).json({ ok: false, message: "Không tìm thấy tài khoản" });
    }
    if (user.password !== currentPassword) {
      return res
        .status(401)
        .json({ ok: false, code: "INVALID_CREDS", message: "Mật khẩu không đúng" });
    }

    // Xóa dữ liệu liên quan
    await Promise.allSettled([
      deleteProjectsByUser(user.userId),
      deleteConversationsByUser(user.userId),
      deleteDaiNaoKeysByUser(user.userId),
      deleteTieuNaoKeysByUser(user.userId),
      deleteWebKeysByUser(user.userId),
      deleteSettings(user.userId),
    ]);

    // Xóa tài khoản
    await deleteUser(user.userId);
    await ghiXoaTaiKhoan(user.userId, { ip: req.ip });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Lỗi server" });
  }
});

export default router;