// server/dai-nao/chon-boss-theo-yeu-cau.js
// Nhiệm vụ: Chọn BOSS theo loại yêu cầu.
// BOSS được gọi từ key Đại Não.
// Quy tắc dự án:
//   - Đại Não có nhiệm vụ duy nhất là dò, gọi model từ key Đại Não.
//   - Model được gọi lên làm BOSS.

import { DAI_NAO_TASK, layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { layModelDangSuDung, datModelDangSuDung } from "./model-dang-su-dung.js";

// ============================================================
// CHỌN
// ============================================================

/**
 * Chọn BOSS (model) để giao nhiệm vụ chính.
 * @param {object} p
 * @param {string} p.userId
 * @returns {Promise<{ok: boolean, boss?: object, error?: string}>}
 */
export async function chonBossTheoYeuCau({ userId }) {
  let candidates = layDanhSachUngVien(DAI_NAO_TASK.CALL_BOSS);
  const active = await layModelDangSuDung(DAI_NAO_TASK.CALL_BOSS);

  if (active && active.name) {
    candidates = [
      { name: active.name, provider: active.provider, priority: 0 },
      ...candidates.filter(
        (c) => !(c.name === active.name && c.provider === active.provider)
      ),
    ];
  }

  const filtered = await locUngVien(candidates);
  if (filtered.length === 0) {
    return { ok: false, error: "Không có BOSS nào khả dụng" };
  }

  const boss = filtered[0];
  await datModelDangSuDung(DAI_NAO_TASK.CALL_BOSS, boss.name);
  return { ok: true, boss };
}

// ============================================================
// CHỌN BOSS THEO LOẠI NHIỆM VỤ (mở rộng)
// ============================================================

/**
 * Với mỗi loại yêu cầu (no_web_no_code | need_web | need_code),
 * Đại Não vẫn gọi BOSS từ danh sách call-boss.
 * Hiện tại cùng 1 danh sách, sau này có thể tách.
 */
export async function chonBossTheoLoai({ userId, label }) {
  // Placeholder — không tách theo label ở bản này
  return chonBossTheoYeuCau({ userId });
}

export default {
  chonBossTheoYeuCau,
  chonBossTheoLoai,
};