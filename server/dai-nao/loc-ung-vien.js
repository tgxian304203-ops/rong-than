// server/dai-nao/loc-ung-vien.js
// Nhiệm vụ: Lọc danh sách model ứng viên của Đại Não.
// Ghi log chi tiết từng ứng viên — giữ hay loại, lý do.

import { kiemTraKhaDung } from "./kiem-tra-kha-dung.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// LỌC
// ============================================================

/**
 * @param {Array} candidates - từ danh-sach-ung-vien.js
 * @returns {Promise<Array>} danh sách đã lọc + sắp xếp
 */
export async function locUngVien(candidates, opts = {}) {
  const { userId = null, tier = "dai-nao" } = opts;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    await logInfo(`${tier}: danh sách ứng viên rỗng`, { userId });
    return [];
  }

  await logInfo(`${tier}: bắt đầu lọc ứng viên`, {
    userId,
    totalCandidates: candidates.length,
    candidates: candidates.map((c) => `${c.name} (${c.provider}, p${c.priority})`),
  });

  const scored = [];
  const rejected = [];

  for (const c of candidates) {
    const health = await kiemTraKhaDung(c.name, c.provider);

    if (health.status === "available" || health.status === "unknown") {
      scored.push({ ...c, _health: health.status });
      await logInfo(`${tier}: giữ ứng viên`, {
        userId,
        model: c.name,
        provider: c.provider,
        priority: c.priority,
        health: health.status,
      });
    } else {
      rejected.push({ ...c, _health: health.status });
      await logInfo(`${tier}: loại ứng viên`, {
        userId,
        model: c.name,
        provider: c.provider,
        priority: c.priority,
        health: health.status,
        reason: "Không khả dụng",
      });
    }
  }

  // Sắp xếp: available trước unknown, sau đó theo priority tăng dần
  scored.sort((a, b) => {
    const aAvail = a._health === "available" ? 0 : 1;
    const bAvail = b._health === "available" ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    return (a.priority || 99) - (b.priority || 99);
  });

  await logInfo(`${tier}: lọc ứng viên xong`, {
    userId,
    kept: scored.length,
    rejected: rejected.length,
    finalOrder: scored.map(
      (c) => `${c.name} (${c.provider}, p${c.priority})`
    ),
  });

  return scored.map(({ _health, ...rest }) => rest);
}

// ============================================================
// CHỌN 1 ỨNG VIÊN TỐT NHẤT
// ============================================================

export async function chonUngVienTotNhat(candidates, opts = {}) {
  const list = await locUngVien(candidates, opts);
  const best = list[0] || null;
  await logInfo(`Ứng viên tốt nhất được chọn`, {
    userId: opts.userId,
    best: best ? `${best.name} (${best.provider})` : null,
  });
  return best;
}

export default {
  locUngVien,
  chonUngVienTotNhat,
};