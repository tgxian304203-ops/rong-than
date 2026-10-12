// server/dai-nao/chon-boss-theo-yeu-cau.js
// Nhiệm vụ: Chọn BOSS theo loại yêu cầu.
// BOSS được gọi từ key Đại Não.

import { DAI_NAO_TASK, layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { layModelDangSuDung, datModelDangSuDung } from "./model-dang-su-dung.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN
// ============================================================

export async function chonBossTheoYeuCau({ userId }) {
  await logInfo("Đại Não: bắt đầu chọn BOSS", { userId });

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
    await logWarn("Đại Não: không có BOSS nào khả dụng", { userId });
    return { ok: false, error: "Không có BOSS nào khả dụng" };
  }

  const boss = filtered[0];
  await datModelDangSuDung(DAI_NAO_TASK.CALL_BOSS, boss.name);

  await logInfo("Đại Não: đã chọn BOSS", {
    userId,
    boss: boss.name,
    provider: boss.provider,
  });

  return { ok: true, boss };
}

export async function chonBossTheoLoai({ userId, label }) {
  return chonBossTheoYeuCau({ userId });
}

export default {
  chonBossTheoYeuCau,
  chonBossTheoLoai,
};