// server/tieu-nao/chon-linh-theo-nhiem-vu.js
// Nhiệm vụ: Chọn lính (model) theo loại nhiệm vụ.

import { layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { listKeysByProvider } from "../db/tieuNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN LÍNH
// ============================================================

export async function chonLinhTheoNhiemVu({ userId, taskType }) {
  await logInfo("Tiểu Não: chọn lính theo nhiệm vụ", { userId, taskType });

  const candidates = layDanhSachUngVien(taskType);
  if (!candidates || candidates.length === 0) {
    await logWarn("Tiểu Não: không có lính nào cho nhiệm vụ", {
      userId,
      taskType,
    });
    return { ok: false, error: `Không có lính nào cho nhiệm vụ ${taskType}` };
  }

  const filtered = await locUngVien(candidates);
  if (filtered.length === 0) {
    await logWarn("Tiểu Não: tất cả lính đều không khả dụng", {
      userId,
      taskType,
    });
    return { ok: false, error: "Tất cả lính ứng viên đều không khả dụng" };
  }

  for (const c of filtered) {
    try {
      const keys = await listKeysByProvider(userId, c.provider);
      const usable = keys.filter((k) => k.quota !== "out");
      if (usable.length > 0) {
        await logInfo("Tiểu Não: đã chọn lính", {
          userId,
          taskType,
          soldier: c.name,
          provider: c.provider,
          usableKeys: usable.length,
        });
        return { ok: true, soldier: c };
      }
    } catch {
      /* bỏ qua, thử ứng viên khác */
    }
  }

  await logWarn("Tiểu Não: không có lính nào có key khả dụng", {
    userId,
    taskType,
  });
  return { ok: false, error: "Không có lính nào có key khả dụng" };
}

export default { chonLinhTheoNhiemVu };