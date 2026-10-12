// server/dai-nao/chon-boss-theo-yeu-cau.js
// Nhiệm vụ: Chọn BOSS theo loại yêu cầu.
// Ghi log cực chi tiết: ứng viên, model đang dùng, kết quả lọc.

import { DAI_NAO_TASK, layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { layModelDangSuDung, datModelDangSuDung } from "./model-dang-su-dung.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN BOSS THEO YÊU CẦU
// ============================================================

export async function chonBossTheoYeuCau({ userId }) {
  await logInfo("Đại Não: ===== BẮT ĐẦU CHỌN BOSS =====", { userId });

  // Bước 1: Lấy danh sách ứng viên gốc
  const baseCandidates = layDanhSachUngVien(DAI_NAO_TASK.CALL_BOSS);
  await logInfo("Đại Não: danh sách ứng viên gốc", {
    userId,
    taskType: DAI_NAO_TASK.CALL_BOSS,
    count: baseCandidates.length,
    list: baseCandidates.map(
      (c) => `${c.name} (${c.provider}, ưu tiên ${c.priority})`
    ),
  });

  // Bước 2: Kiểm tra model đang sử dụng
  const active = await layModelDangSuDung(DAI_NAO_TASK.CALL_BOSS);
  if (active && active.name) {
    await logInfo("Đại Não: model đang sử dụng trước đó", {
      userId,
      activeModel: active.name,
      activeProvider: active.provider,
    });
  } else {
    await logInfo("Đại Não: chưa có model đang sử dụng — chọn mới", { userId });
  }

  // Bước 3: Gộp active lên đầu nếu có
  let candidates = baseCandidates;
  if (active && active.name) {
    candidates = [
      { name: active.name, provider: active.provider, priority: 0 },
      ...baseCandidates.filter(
        (c) => !(c.name === active.name && c.provider === active.provider)
      ),
    ];
    await logInfo("Đại Não: gộp model đang dùng lên đầu danh sách", {
      userId,
      candidates: candidates.map(
        (c) => `${c.name} (${c.provider}, p${c.priority})`
      ),
    });
  }

  // Bước 4: Lọc ứng viên khả dụng
  await logInfo("Đại Não: tiến hành lọc ứng viên", {
    userId,
    taskType: DAI_NAO_TASK.CALL_BOSS,
  });

  const filtered = await locUngVien(candidates, {
    userId,
    tier: "dai-nao",
  });

  if (filtered.length === 0) {
    await logWarn("Đại Não: không có BOSS nào khả dụng sau khi lọc", {
      userId,
    });
    return { ok: false, error: "Không có BOSS nào khả dụng" };
  }

  // Bước 5: Chọn BOSS đầu tiên trong danh sách đã sắp xếp
  const boss = filtered[0];

  await logInfo("Đại Não: ĐÃ CHỌN BOSS", {
    userId,
    boss: boss.name,
    provider: boss.provider,
    priority: boss.priority,
    totalCandidates: filtered.length,
    alternativeCandidates: filtered.slice(1).map(
      (c) => `${c.name} (${c.provider}, p${c.priority})`
    ),
  });

  // Bước 6: Đặt làm model đang sử dụng
  await datModelDangSuDung(DAI_NAO_TASK.CALL_BOSS, boss.name);

  await logInfo("Đại Não: ===== CHỌN BOSS HOÀN TẤT =====", {
    userId,
    chosen: `${boss.name} (${boss.provider})`,
  });

  return { ok: true, boss };
}

// ============================================================
// CHỌN BOSS THEO LOẠI (mở rộng)
// ============================================================

export async function chonBossTheoLoai({ userId, label }) {
  await logInfo("Đại Não: chọn BOSS theo loại yêu cầu", {
    userId,
    label,
  });
  return chonBossTheoYeuCau({ userId });
}

export default {
  chonBossTheoYeuCau,
  chonBossTheoLoai,
};