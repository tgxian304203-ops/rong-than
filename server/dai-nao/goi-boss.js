// server/dai-nao/goi-boss.js
// Nhiệm vụ: Gọi model lên làm BOSS.

import { listKeysByProvider, updateQuota } from "../db/daiNaoKeys.js";
import { createSession } from "../db/bossSessions.js";
import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { baoCaoConDung, baoCaoHetQuota, baoCaoLoi } from "./kiem-tra-kha-dung.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI BOSS
// ============================================================

export async function goiBoss({
  userId,
  conversationId,
  boss,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
}) {
  if (!boss || !boss.name || !boss.provider) {
    return { ok: false, error: "Thiếu thông tin BOSS" };
  }

  const mod = MODULES[boss.provider];
  if (!mod) {
    return { ok: false, error: `Chưa hỗ trợ provider ${boss.provider}` };
  }

  await logInfo("BOSS: bắt đầu gọi", {
    userId,
    conversationId,
    boss: boss.name,
    provider: boss.provider,
  });

  const keys = await listKeysByProvider(userId, boss.provider);
  if (!keys || keys.length === 0) {
    await logWarn("BOSS: không có key nào", {
      userId,
      provider: boss.provider,
    });
    return { ok: false, error: `Không có key nào cho ${boss.provider}` };
  }

  const errors = [];

  for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
    let anyAvailable = false;

    for (const key of keys) {
      if (key.quota === "out") continue;
      anyAvailable = true;

      try {
        const res = await mod.chat({
          rawKey: key.rawKey,
          model: boss.name,
          messages,
          temperature,
          maxTokens,
          signal,
        });

        if (res.ok) {
          await baoCaoConDung(boss.name, boss.provider);

          const session = await createSession({
            userId,
            conversationId,
            modelName: boss.name,
            provider: boss.provider,
            keyId: String(key._id),
          });

          await logInfo("BOSS: gọi thành công", {
            userId,
            conversationId,
            boss: boss.name,
            provider: boss.provider,
            keyId: String(key._id),
          });

          return {
            ok: true,
            text: res.text,
            usage: res.usage,
            session,
            keyId: String(key._id),
          };
        }
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();

        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
          await updateQuota(key._id, "out");
          await baoCaoHetQuota(boss.name, boss.provider);
          await logWarn("BOSS: key hết quota, xoay key", {
            userId,
            keyId: String(key._id),
            boss: boss.name,
          });
          continue;
        }

        if (msg.includes("invalid") || msg.includes("401") || msg.includes("403")) {
          await updateQuota(key._id, "out");
          await logWarn("BOSS: key không hợp lệ, xoay key", {
            userId,
            keyId: String(key._id),
          });
          continue;
        }

        await baoCaoLoi(boss.name, boss.provider, err?.message || "Lỗi");
        errors.push(err?.message || "Lỗi không rõ");
        await logWarn("BOSS: gọi lỗi", {
          userId,
          boss: boss.name,
          error: err?.message || String(err),
        });
      }
    }

    if (!anyAvailable) break;
  }

  await logWarn("BOSS: thất bại sau tất cả nỗ lực", {
    userId,
    boss: boss.name,
    errors: errors.join(" | "),
  });

  return {
    ok: false,
    error: errors.join(" | ") || "Không gọi được BOSS",
  };
}

export default { goiBoss };