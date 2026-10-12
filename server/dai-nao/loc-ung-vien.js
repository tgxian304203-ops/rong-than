// server/dai-nao/loc-ung-vien.js
// Nhiệm vụ: Lọc danh sách model ứng viên của Đại Não.
// - Sắp xếp theo hạng sức mạnh.
// - Nếu bảng tĩnh hết → bổ sung model động từ provider.

import { kiemTraKhaDung } from "./kiem-tra-kha-dung.js";
import {
  doModelDongTuProvider,
} from "./danh-sach-ung-vien.js";
import { sapXepTheoSucManh } from "./bang-xep-hang-model.js";
import { listKeysByProvider } from "../db/daiNaoKeys.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// LỌC BẢNG TĨNH
// ============================================================

/**
 * Lọc ứng viên tĩnh theo modelHealth.
 * @param {Array} candidates
 * @param {object} opts
 * @returns {Promise<Array>}
 */
export async function locUngVienTinh(candidates, opts = {}) {
  const { userId = null, tier = "dai-nao" } = opts;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const scored = [];
  const rejected = [];

  for (const c of candidates) {
    const health = await kiemTraKhaDung(c.name, c.provider);
    if (health.status === "available" || health.status === "unknown") {
      scored.push({ ...c, _health: health.status });
    } else {
      rejected.push({ ...c, _health: health.status });
    }
  }

  await logInfo(`${tier}: lọc tĩnh xong`, {
    userId,
    kept: scored.length,
    rejected: rejected.length,
  });

  return scored.map(({ _health, ...rest }) => rest);
}

// ============================================================
// LỌC FULL (TĨNH + ĐỘNG)
// ============================================================

/**
 * Lọc ứng viên — TĨNH trước, nếu hết thì DÒ ĐỘNG.
 *
 * @param {Array} candidates — ứng viên tĩnh
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.taskType  — dùng để xếp hạng + log
 * @returns {Promise<Array>}
 */
export async function locUngVien(candidates, opts = {}) {
  const { userId, taskType = null, tier = "dai-nao" } = opts;

  if (!Array.isArray(candidates)) candidates = [];

  // 1. Lọc bảng tĩnh
  const staticFiltered = await locUngVienTinh(candidates, { userId, tier });

  // 2. Nếu tĩnh còn → sắp xếp theo sức mạnh + trả về
  if (staticFiltered.length > 0) {
    const sorted = sapXepTheoSucManh(staticFiltered, taskType);
    await logInfo(`${tier}: sắp xếp ứng viên tĩnh theo sức mạnh`, {
      userId,
      order: sorted.map((c) => `${c.name} (${c.provider})`),
    });
    return sorted;
  }

  // 3. Tĩnh hết → dò ĐỘNG từ provider
  await logWarn(`${tier}: bảng tĩnh hết — bắt đầu dò động`, {
    userId,
    taskType,
  });

  const providers = ["groq", "gemini", "openrouter"];
  const dynamicCandidates = [];
  const triedNames = new Set(candidates.map((c) => `${c.provider}:${c.name}`));

  for (const provider of providers) {
    // Kiểm tra provider có key còn quota không
    if (userId) {
      const keys = await listKeysByProvider(userId, provider);
      const usable = keys.filter((k) => k.quota !== "out");
      if (usable.length === 0) {
        await logInfo(`${tier}: bỏ qua ${provider} (không có key còn quota)`, {
          userId,
        });
        continue;
      }
    }

    const res = await doModelDongTuProvider({ userId, provider });
    if (!res.ok) {
      await logWarn(`${tier}: dò động ${provider} lỗi`, {
        error: res.error,
      });
      continue;
    }

    for (const name of res.models) {
      const key = `${provider}:${name}`;
      if (triedNames.has(key)) continue;
      triedNames.add(key);
      dynamicCandidates.push({ name, provider, priority: 99, _dynamic: true });
    }
  }

  await logInfo(`${tier}: dò động xong`, {
    userId,
    totalDynamic: dynamicCandidates.length,
  });

  // 4. Sắp xếp model động theo sức mạnh
  const sortedDynamic = sapXepTheoSucManh(dynamicCandidates, taskType);

  await logInfo(`${tier}: sắp xếp model động theo sức mạnh (top 10)`, {
    userId,
    order: sortedDynamic.slice(0, 10).map((c) => `${c.name} (${c.provider})`),
  });

  return sortedDynamic;
}

// ============================================================
// CHỌN ỨNG VIÊN TỐT NHẤT
// ============================================================

export async function chonUngVienTotNhat(candidates, opts = {}) {
  const list = await locUngVien(candidates, opts);
  const best = list[0] || null;
  await logInfo("Ứng viên tốt nhất được chọn", {
    userId: opts.userId,
    best: best ? `${best.name} (${best.provider})` : null,
  });
  return best;
}

export default {
  locUngVienTinh,
  locUngVien,
  chonUngVienTotNhat,
};