// server/dai-nao/goi-boss.js
// Nhiệm vụ: Gọi BOSS.
// Thử lần lượt các BOSS ứng viên — không dừng ở BOSS chính.

import { listKeysByProvider, updateQuota } from "../db/daiNaoKeys.js";
import { createSession } from "../db/bossSessions.js";
import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import {
  baoCaoConDung,
  baoCaoHetQuota,
  baoCaoLoi,
} from "./kiem-tra-kha-dung.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI BOSS — THỬ LẦN LƯỢT
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {object} p.boss           — BOSS chính (ưu tiên 1)
 * @param {Array} [p.candidates]    — TOÀN BỘ danh sách ứng viên (để fallback)
 * @param {Array} p.messages
 * @param {number} [p.temperature]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, text?: string, usage?: object, session?: object, boss?: object, keyId?: string, error?: string}>}
 */
export async function goiBoss({
  userId,
  conversationId,
  boss,
  candidates = null,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
}) {
  if (!boss || !boss.name || !boss.provider) {
    return { ok: false, error: "Thiếu thông tin BOSS" };
  }

  // Danh sách để thử lần lượt: BOSS chính + dự phòng
  const tryList = Array.isArray(candidates) && candidates.length > 0
    ? candidates
    : [boss];

  await logInfo(`Đại Não: bắt đầu thử ${tryList.length} BOSS`, {
    userId,
    conversationId,
    firstBoss: tryList[0]?.name,
  });

  // ============================================================
  // DUYỆT TỪNG BOSS
  // ============================================================
  for (let bossIdx = 0; bossIdx < tryList.length; bossIdx++) {
    const currentBoss = tryList[bossIdx];

    const mod = MODULES[currentBoss.provider];
    if (!mod) {
      await logWarn(`Đại Não: bỏ qua BOSS (provider không hỗ trợ)`, {
        boss: currentBoss.name,
        provider: currentBoss.provider,
      });
      continue;
    }

    const keys = await listKeysByProvider(userId, currentBoss.provider);
    if (!keys || keys.length === 0) {
      await logInfo(`Đại Não: bỏ qua BOSS (không có key)`, {
        boss: currentBoss.name,
        provider: currentBoss.provider,
      });
      continue;
    }

    await logInfo(`Đại Não: thử BOSS #${bossIdx + 1}`, {
      userId,
      conversationId,
      boss: currentBoss.name,
      provider: currentBoss.provider,
    });

    // ============================================================
    // XOAY KEY CHO BOSS NÀY
    // ============================================================
    let bossSucceeded = false;
    let lastError = null;
    const errors = [];

    for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
      let anyAvailable = false;

      for (const key of keys) {
        if (key.quota === "out") continue;
        anyAvailable = true;

        try {
          const res = await mod.chat({
            rawKey: key.rawKey,
            model: currentBoss.name,
            messages,
            temperature,
            maxTokens,
            signal,
          });

          if (res.ok) {
            await baoCaoConDung(currentBoss.name, currentBoss.provider);

            const session = await createSession({
              userId,
              conversationId,
              modelName: currentBoss.name,
              provider: currentBoss.provider,
              keyId: String(key._id),
            });

            await logInfo(`Đại Não: BOSS THÀNH CÔNG`, {
              userId,
              conversationId,
              boss: currentBoss.name,
              provider: currentBoss.provider,
              keyId: String(key._id),
              position: bossIdx + 1,
            });

            return {
              ok: true,
              text: res.text,
              usage: res.usage,
              session,
              boss: currentBoss,
              keyId: String(key._id),
            };
          }

          lastError = res.error || "Không rõ";
          errors.push(`${currentBoss.name}: ${lastError}`);
        } catch (err) {
          const msg = String(err?.message || "").toLowerCase();
          lastError = err?.message || "Lỗi không rõ";

          // Hết quota / key sai → đánh dấu key hết, thử key khác
          if (
            msg.includes("quota") ||
            msg.includes("429") ||
            msg.includes("rate") ||
            msg.includes("invalid") ||
            msg.includes("401") ||
            msg.includes("403")
          ) {
            await updateQuota(key._id, "out");

            if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
              await baoCaoHetQuota(currentBoss.name, currentBoss.provider);
            }

            await logWarn(`Đại Não: key lỗi, xoay key`, {
              userId,
              boss: currentBoss.name,
              keyId: String(key._id),
              reason: msg.includes("quota") ? "quota" : "invalid",
            });
            continue;
          }

          // Lỗi khác
          await baoCaoLoi(currentBoss.name, currentBoss.provider, lastError);
          errors.push(`${currentBoss.name}: ${lastError}`);
          await logWarn(`Đại Não: BOSS lỗi`, {
            userId,
            boss: currentBoss.name,
            error: lastError,
          });
        }
      }

      if (!anyAvailable) break;
    }

    // BOSS này thất bại → thử BOSS tiếp theo
    if (!bossSucceeded) {
      await baoCaoLoi(currentBoss.name, currentBoss.provider, "Thất bại hết key");
      await logWarn(
        `Đại Não: BOSS #${bossIdx + 1} thất bại — chuyển BOSS tiếp theo`,
        {
          userId,
          boss: currentBoss.name,
          errors: errors.slice(0, 3),
        }
      );
      continue;
    }
  }

  // ============================================================
  // HẾT TẤT CẢ BOSS
  // ============================================================
  await logWarn("Đại Não: TẤT CẢ BOSS đều thất bại", {
    userId,
    conversationId,
    totalTried: tryList.length,
  });

  return {
    ok: false,
    error: `Đã thử ${tryList.length} BOSS nhưng tất cả đều thất bại`,
  };
}

export default { goiBoss };