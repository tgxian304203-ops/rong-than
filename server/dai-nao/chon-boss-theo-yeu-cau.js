// server/dai-nao/chon-boss-theo-yeu-cau.js
// Nhiệm vụ: Chọn BOSS theo loại yêu cầu.
// Ghi log cực chi tiết: ứng viên gốc, active, lọc, chọn.

import { DAI_NAO_TASK, layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { layModelDangSuDung, datModelDangSuDung } from "./model-dang-su-dung.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

export async function chonBossTheoYeuCau({ userId }) {
  // ===== BƯỚC 1: Bắt đầu =====
  await logInfo("Đại Não: === BẮT ĐẦU CHỌN BOSS ===", { userId });

  // ===== BƯỚC 2: Lấy danh sách ứng viên gốc =====
  const baseCandidates = layDanhSachUngVien(DAI_NAO_TASK.CALL_BOSS);
  await logInfo(
    `Đại Não: danh sách ứng viên gốc (${baseCandidates.length} model)`,
    {
      userId,
      taskType: DAI_NAO_TASK.CALL_BOSS,
      list: baseCandidates.map(
        (c) => `${c.name} | provider=${c.provider} | ưu tiên=${c.priority}`
      ),
    }
  );

  // ===== BƯỚC 3: Kiểm tra model đang sử dụng =====
  const active = await layModelDangSuDung(DAI_NAO_TASK.CALL_BOSS);
  if (active && active.name) {
    await logInfo(
      `Đại Não: model đang dùng trước đó = ${active.name} (${active.provider})`,
      { userId }
    );
  } else {
    await logInfo("Đại Não: chưa có model đang dùng — chọn mới", { userId });
  }

  // ===== BƯỚC 4: Gộp active lên đầu =====
  let candidates = baseCandidates;
  if (active && active.name) {
    candidates = [
      { name: active.name, provider: active.provider, priority: 0 },
      ...baseCandidates.filter(
        (c) => !(c.name === active.name && c.provider === active.provider)
      ),
    ];
    await logInfo("Đại Não: đưa model đang dùng lên đầu danh sách", {
      userId,
      order: candidates.map(
        (c) => `${c.name} (${c.provider}, p${c.priority})`
      ),
    });
  }

  // ===== BƯỚC 5: Lọc ứng viên khả dụng =====
  await logInfo("Đại Não: bắt đầu lọc ứng viên khả dụng", { userId });

  const filtered = await locUngVien(candidates, {
    userId,
    tier: "dai-nao",
  });

  if (filtered.length === 0) {
    await logWarn("Đại Não: KHÔNG có BOSS nào khả dụng sau khi lọc", {
      userId,
    });
    return { ok: false, error: "Không có BOSS nào khả dụng" };
  }

  // ===== BƯỚC 6: Chọn BOSS =====
  const boss = filtered[0];

  await logInfo(
    `Đại Não: >>> ĐÃ CHỌN BOSS: ${boss.name} <<<`,
    {
      userId,
      boss: boss.name,
      provider: boss.provider,
      priority: boss.priority,
    }
  );

  await logInfo(
    `Đại Não: còn ${filtered.length - 1} ứng viên dự phòng`,
    {
      userId,
      backups: filtered.slice(1).map(
        (c) => `${c.name} (${c.provider}, p${c.priority})`
      ),
    }
  );

  // ===== BƯỚC 7: Đặt làm model đang dùng =====
  await datModelDangSuDung(DAI_NAO_TASK.CALL_BOSS, boss.name);

  // ===== BƯỚC 8: Kết thúc =====
  await logInfo("Đại Não: === KẾT THÚC CHỌN BOSS ===", {
    userId,
    chosen: `${boss.name} (${boss.provider})`,
  });

  return { ok: true, boss };
}

export async function chonBossTheoLoai({ userId, label }) {
  await logInfo(`Đại Não: chọn BOSS theo loại yêu cầu (${label})`, { userId });
  return chonBossTheoYeuCau({ userId });
}

export default {
  chonBossTheoYeuCau,
  chonBossTheoLoai,
};