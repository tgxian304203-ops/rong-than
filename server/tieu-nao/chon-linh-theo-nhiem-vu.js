// server/tieu-nao/chon-linh-theo-nhiem-vu.js
// Nhiệm vụ: Chọn lính (model) theo loại nhiệm vụ.
// Trả về danh sách lính ứng viên (sắp theo sức mạnh) — không chỉ 1.

import { layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHỌN LÍNH
// ============================================================

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
    return {
      ok: false,
      error: `Không có lính nào cho nhiệm vụ ${taskType}`,
    };
  }

  await logInfo(
    `Tiểu Não: danh sách ứng viên lính gốc (${candidates.length} model)`,
    {
      userId,
      candidates: candidates.map(
        (c) => `${c.name} | ${c.provider} | ưu tiên ${c.priority}`
      ),
    }
  );

  // Lọc + sắp xếp theo sức mạnh
  const filtered = await locUngVien(candidates, {
    userId,
    taskType,
    tier: "tieu-nao",
  });

  if (filtered.length === 0) {
    await logWarn("Tiểu Não: tất cả lính đều không khả dụng", {
      userId,
      taskType,
    });
    return {
      ok: false,
      error: "Tất cả lính ứng viên đều không khả dụng",
    };
  }

  const linh = filtered[0];

  await logInfo(`Tiểu Não: >>> LÍNH CHÍNH: ${linh.name} <<<`, {
    userId,
    taskType,
    soldier: linh.name,
    provider: linh.provider,
    priority: linh.priority,
    totalCandidates: filtered.length,
  });

  await logInfo(
    `Tiểu Não: còn ${filtered.length - 1} lính dự phòng`,
    {
      userId,
      backups: filtered.slice(1, 6).map((c) => `${c.name} (${c.provider})`),
    }
  );

  await logInfo("Tiểu Não: === KẾT THÚC CHỌN LÍNH ===", {
    userId,
    chosen: `${linh.name} (${linh.provider})`,
  });

  return {
    ok: true,
    soldier: linh,
    candidates: filtered,  // ← trả TOÀN BỘ danh sách
  };
}

export default { chonLinhTheoNhiemVu };