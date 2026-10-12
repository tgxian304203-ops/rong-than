// server/security/phan-quyen.js
// Nhiệm vụ: Phân quyền đơn giản theo userId.
// Vì dự án không dùng JWT/session, quyền được xác định bằng:
//   - header "X-User-Id" do frontend gửi kèm
//   - hoặc tham số userId trong body (chỉ khi đọc dữ liệu công khai)
//
// Mọi thao tác đọc/ghi dữ liệu cá nhân phải khớp userId.

// ============================================================
// LẤY USER ID TỪ REQUEST
// ============================================================

/**
 * Lấy userId từ request (header hoặc body).
 * @returns {string|null}
 */
export function getUserIdFromRequest(req) {
  const fromHeader =
    req?.headers?.["x-user-id"] ||
    req?.headers?.["X-User-Id"] ||
    null;
  if (typeof fromHeader === "string" && fromHeader.trim()) {
    return fromHeader.trim();
  }

  const fromBody = req?.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) {
    return fromBody.trim();
  }

  const fromQuery = req?.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) {
    return fromQuery.trim();
  }

  return null;
}

// ============================================================
// MIDDLEWARE — YÊU CẦU ĐĂNG NHẬP
// ============================================================

/**
 * Middleware Express: bắt buộc phải có userId trong request.
 * Nếu thiếu → trả về 401.
 */
export function requireUser(req, res, next) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({
      ok: false,
      code: "NO_USER",
      message: "Chưa đăng nhập. Vui lòng đăng nhập lại.",
    });
  }
  req.userId = userId;
  next();
}

// ============================================================
// KIỂM TRA CHỦ SỞ HỮU
// ============================================================

/**
 * Kiểm tra userId có khớp với chủ của tài nguyên không.
 * Dùng để chặn user A truy cập dữ liệu user B.
 */
export function isOwner(reqUserId, resourceUserId) {
  if (!reqUserId || !resourceUserId) return false;
  return String(reqUserId) === String(resourceUserId);
}

export default {
  getUserIdFromRequest,
  requireUser,
  isOwner,
};