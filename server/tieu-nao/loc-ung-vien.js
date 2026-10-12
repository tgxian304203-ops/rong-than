// server/tieu-nao/loc-ung-vien.js
// Nhiệm vụ: Lọc danh sách model ứng viên của Tiểu Não.
// Quy tắc dự án:
//   - Bỏ model đang lỗi / hết quota.
//   - Sắp theo priority (1 → 2 → ...).
//   - Nếu tất cả ứng viên hết → hạ xuống hạng thấp hơn.

import { kiemTraKhaDung } from "./kiem-tra-kha-dung.js";

// ============================================================
// LỌC
// ============================================================

/**
 * @param {Array} candidates
 * @returns {Promise<Array>}
 */
export async function locUngVien(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const scored = [];

  for (const c of candidates) {
    const health = await kiemTraKhaDung(c.name, c.provider);
    if (health.status === "available" || health.status === "unknown") {
      scored.push({ ...c, _health: health.status });
    }
  }

  scored.sort((a, b) => {
    const aAvail = a._health === "available" ? 0 : 1;
    const bAvail = b._health === "available" ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    return (a.priority || 99) - (b.priority || 99);
  });

  return scored.map(({ _health, ...rest }) => rest);
}

// ============================================================
// CHỌN 1 ỨNG VIÊN TỐT NHẤT
// ============================================================

export async function chonUngVienTotNhat(candidates) {
  const list = await locUngVien(candidates);
  return list[0] || null;
}

export default {
  locUngVien,
  chonUngVienTotNhat,
};