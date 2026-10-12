// server/tieu-nao/chon-linh-theo-nhiem-vu.js
// Nhiệm vụ: Chọn lính (model) theo loại nhiệm vụ.
// Log rõ tên lính được chọn.

import { layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { listKeysByProvider } from "../db/tieuNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

export async function chonLinhTheoNhiemVu({ userId, taskType }) {
  await logInfo(
    `Tiểu Não: === BẮT ĐẦU CHỌN LÍNH cho nhiệm vụ "${taskType}" ===`,
    { userId }
  );

  const candidates = layDanhSachUngVien(taskType);
  if (!candidates || candidates.length === 0) {
    await logWarn("Tiểu Não: không có ứng viên lính nào cho nhiệm vụ", {
      userId,
      taskType,
    });
    return { ok: false, error: `Không có lính nào cho nhiệm vụ ${taskType}` };
  }

  await logInfo(
    `Tiểu Não: danh sách ứng viên lính (${candidates.length} model)`,
    {
      userId,
      candidates: candidates.map(
        (c) => `${c.name} | provider=${c.provider} | ưu tiên=${c.priority}`
      ),
    }
  );

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
        await logInfo(
          `Tiểu Não: >>> ĐÃ CHỌN LÍNH: ${c.name} <<<`,
          {
            userId,
            taskType,
            soldier: c.name,
            provider: c.provider,
            priority: c.priority,
            usableKeys: usable.length,
          }
        );

        await logInfo("Tiểu Não: === KẾT THÚC CHỌN LÍNH ===", {
          userId,
          chosen: `${c.name} (${c.provider})`,
        });

        return { ok: true, soldier: c };
      } else {
        await logInfo("Tiểu Não: bỏ qua lính (không có key khả dụng)", {
          userId,
          soldier: c.name,
          provider: c.provider,
        });
      }
    } catch (err) {
      await logWarn("Tiểu Não: lỗi khi kiểm tra key cho lính", {
        soldier: c.name,
        error: err?.message || String(err),
      });
    }
  }

  await logWarn("Tiểu Não: không có lính nào có key khả dụng", {
    userId,
    taskType,
  });
  return { ok: false, error: "Không có lính nào có key khả dụng" };
}

export default { chonLinhTheoNhiemVu };