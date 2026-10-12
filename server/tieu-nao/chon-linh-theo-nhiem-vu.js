// server/tieu-nao/chon-linh-theo-nhiem-vu.js
// Nhiệm vụ: Chọn lính (model) theo loại nhiệm vụ.
// Quy tắc dự án:
//   - Lính được gọi lên từ key Tiểu Não.
//   - Chọn theo nhiệm vụ (viết code / sửa code / đọc tài liệu dài / ...).
//   - Tiểu Não chỉ dùng key của Tiểu Não.

import { layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { listKeysByProvider } from "../db/tieuNaoKeys.js";

// ============================================================
// CHỌN LÍNH
// ============================================================

/**
 * Chọn lính theo nhiệm vụ.
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.taskType   - giá trị nội bộ (write-code, fix-code, ...)
 * @returns {Promise<{ok: boolean, soldier?: object, error?: string}>}
 */
export async function chonLinhTheoNhiemVu({ userId, taskType }) {
  const candidates = layDanhSachUngVien(taskType);
  if (!candidates || candidates.length === 0) {
    return { ok: false, error: `Không có lính nào cho nhiệm vụ ${taskType}` };
  }

  const filtered = await locUngVien(candidates);
  if (filtered.length === 0) {
    return { ok: false, error: "Tất cả lính ứng viên đều không khả dụng" };
  }

  // Ưu tiên ứng viên nào có key còn dùng được ở Tiểu Não
  for (const c of filtered) {
    try {
      const keys = await listKeysByProvider(userId, c.provider);
      const usable = keys.filter((k) => k.quota !== "out");
      if (usable.length > 0) {
        return { ok: true, soldier: c };
      }
    } catch {
      /* bỏ qua, thử ứng viên khác */
    }
  }

  return { ok: false, error: "Không có lính nào có key khả dụng" };
}

export default { chonLinhTheoNhiemVu };