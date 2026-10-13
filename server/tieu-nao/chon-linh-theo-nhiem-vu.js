// server/tieu-nao/chon-linh-theo-nhiem-vu.js
// Nhiệm vụ: Chọn lính (model) theo loại nhiệm vụ.
// Sửa: Ưu tiên Gemini khi yêu cầu dài (> 20k tokens).

import { layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { LIMITS } from "../config/limits.js";

// ============================================================
// CHỌN LÍNH
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.taskType
 * @param {number} [p.tokens]   — số token ước tính của yêu cầu + lịch sử
 * @returns {Promise<{ok: boolean, soldier?: object, candidates?: Array, error?: string}>}
 */
export async function chonLinhTheoNhiemVu({ userId, taskType, tokens = 0 }) {
  await logInfo(
    `Tiểu Não: === BẮT ĐẦU CHỌN LÍNH cho "${taskType}" ===`,
    { userId, tokens }
  );

  let candidates = layDanhSachUngVien(taskType);
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

  // ============================================================
  // NẾU TOKENS LỚN → ƯU TIÊN GEMINI
  // ============================================================
  if (tokens > LIMITS.CONTEXT_TOKEN_GROQ_MAX) {
    await logInfo(
      `Tiểu Não: yêu cầu dài (${tokens} tokens) → ưu tiên Gemini`,
      { userId, taskType }
    );

    const geminiFirst = [
      { name: "gemini-3.1-flash-lite", provider: "gemini", priority: 0 },
      { name: "gemini-3-flash", provider: "gemini", priority: 1 },
      ...candidates,
    ];

    // Loại trùng
    const seen = new Set();
    candidates = geminiFirst.filter((c) => {
      const key = `${c.provider}:${c.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  await logInfo(
    `Tiểu Não: danh sách ứng viên lính (${candidates.length} model)`,
    {
      userId,
      candidates: candidates.map(
        (c) => `${c.name} | ${c.provider} | ưu tiên ${c.priority}`
      ),
    }
  );

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
    candidates: filtered,
  };
}

export default { chonLinhTheoNhiemVu };