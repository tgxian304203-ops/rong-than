// server/dai-nao/chon-boss-theo-yeu-cau.js
// Nhiệm vụ: Chọn BOSS theo loại yêu cầu.
// Trả về danh sách BOSS ứng viên (sắp theo sức mạnh) — không chỉ 1.

import { DAI_NAO_TASK, layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { layModelDangSuDung, datModelDangSuDung } from "./model-dang-su-dung.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN BOSS THEO YÊU CẦU
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @returns {Promise<{ok: boolean, boss?: object, candidates?: Array, error?: string}>}
 */
export async function chonBossTheoYeuCau({ userId }) {
  await logInfo("Đại Não: === BẮT ĐẦU CHỌN BOSS ===", { userId });

  const baseCandidates = layDanhSachUngVien(DAI_NAO_TASK.CALL_BOSS);

  await logInfo("Đại Não: danh sách ứng viên gốc", {
    userId,
    count: baseCandidates.length,
    list: baseCandidates.map(
      (c) => `${c.name} (${c.provider}, ưu tiên ${c.priority})`
    ),
  });

  // Kiểm tra model đang dùng
  const active = await layModelDangSuDung(DAI_NAO_TASK.CALL_BOSS);
  if (active && active.name) {
    await logInfo(`Đại Não: model đang dùng = ${active.name}`, { userId });
  }

  // Gộp active lên đầu
  let candidates = baseCandidates;
  if (active && active.name) {
    candidates = [
      { name: active.name, provider: active.provider, priority: 0 },
      ...baseCandidates.filter(
        (c) => !(c.name === active.name && c.provider === active.provider)
      ),
    ];
  }

  // Lọc + sắp xếp theo sức mạnh
  const filtered = await locUngVien(candidates, {
    userId,
    taskType: DAI_NAO_TASK.CALL_BOSS,
    tier: "dai-nao",
  });

  if (filtered.length === 0) {
    await logWarn("Đại Não: không có BOSS nào khả dụng", { userId });
    return { ok: false, error: "Không có BOSS nào khả dụng" };
  }

  const boss = filtered[0];

  await logInfo(`Đại Não: >>> BOSS CHÍNH: ${boss.name} <<<`, {
    userId,
    boss: boss.name,
    provider: boss.provider,
    priority: boss.priority,
    totalCandidates: filtered.length,
  });

  await logInfo(
    `Đại Não: còn ${filtered.length - 1} BOSS dự phòng`,
    {
      userId,
      backups: filtered
        .slice(1, 6)
        .map((c) => `${c.name} (${c.provider})`),
    }
  );

  // Đặt làm model đang sử dụng
  await datModelDangSuDung(DAI_NAO_TASK.CALL_BOSS, boss.name);

  await logInfo("Đại Não: === KẾT THÚC CHỌN BOSS ===", {
    userId,
    chosen: `${boss.name} (${boss.provider})`,
  });

  return {
    ok: true,
    boss,
    candidates: filtered,  // ← trả TOÀN BỘ danh sách để goi-boss thử lần lượt
  };
}

export async function chonBossTheoLoai({ userId, label }) {
  await logInfo(`Đại Não: chọn BOSS theo loại yêu cầu (${label})`, { userId });
  return chonBossTheoYeuCau({ userId });
}

export default {
  chonBossTheoYeuCau,
  chonBossTheoLoai,
};