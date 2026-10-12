// server/security/nhat-ky-bao-mat.js
// Nhiệm vụ: Nhật ký bảo mật — ghi lại các sự kiện quan trọng:
//   - Đăng nhập thành công / thất bại
//   - Đổi mật khẩu
//   - Đổi ID
//   - Xóa tài khoản
//   - Thêm / xóa API key
// Ghi qua ghi-log.js để tự động che dữ liệu nhạy cảm.

import { ghiLog } from "../logs/ghi-log.js";

// ============================================================
// SỰ KIỆN
// ============================================================

export async function ghiDangNhapThanhCong(userId, meta = {}) {
  return ghiLog("info", `Đăng nhập thành công: ${userId}`, { ...meta, userId });
}

export async function ghiDangNhapThatBai(userId, meta = {}) {
  return ghiLog("warn", `Đăng nhập thất bại: ${userId}`, { ...meta, userId });
}

export async function ghiDangKy(userId, meta = {}) {
  return ghiLog("info", `Đăng ký tài khoản: ${userId}`, { ...meta, userId });
}

export async function ghiDoiId(oldUserId, newUserId, meta = {}) {
  return ghiLog("info", `Đổi ID tài khoản: ${oldUserId} → ${newUserId}`, {
    ...meta,
    oldUserId,
    newUserId,
  });
}

export async function ghiDoiMatKhau(userId, meta = {}) {
  return ghiLog("info", `Đổi mật khẩu: ${userId}`, { ...meta, userId });
}

export async function ghiXoaTaiKhoan(userId, meta = {}) {
  return ghiLog("warn", `Xóa tài khoản: ${userId}`, { ...meta, userId });
}

export async function ghiThemKey(tier, provider, userId, meta = {}) {
  return ghiLog("info", `Thêm API key ${provider} vào ${tier}`, {
    ...meta,
    tier,
    provider,
    userId,
  });
}

export async function ghiXoaKey(tier, provider, userId, meta = {}) {
  return ghiLog("info", `Xóa API key ${provider} khỏi ${tier}`, {
    ...meta,
    tier,
    provider,
    userId,
  });
}

export async function ghiHanhViDangNgo(message, meta = {}) {
  return ghiLog("warn", `Hành vi đáng ngờ: ${message}`, meta);
}

export default {
  ghiDangNhapThanhCong,
  ghiDangNhapThatBai,
  ghiDangKy,
  ghiDoiId,
  ghiDoiMatKhau,
  ghiXoaTaiKhoan,
  ghiThemKey,
  ghiXoaKey,
  ghiHanhViDangNgo,
};