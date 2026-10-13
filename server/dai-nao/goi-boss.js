// server/dai-nao/goi-boss.js
// Nhiệm vụ: Gọi BOSS.
//
// LOGIC XOAY:
//   1. Với mỗi KEY → xoay HẾT model trong candidates (ưu tiên + phụ).
//   2. Hết model → xoay KEY tiếp theo → lặp.
//   3. Hết TẤT CẢ key + model tĩnh → dò động model.
//   4. Xoay model động trong key → lặp.

import { listKeysByProvider, updateQuota } from "../db/daiNaoKeys.js";
import { createSession } from "../db/bossSessions.js";
import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import {
  baoCaoConDung,
  baoCaoHetQuota,
  baoCaoLoi,
} from "./kiem-tra-kha-dung.js";
import {
  layDanhSachUngVien,
  doTatCaModelDong,
  DAI_NAO_TASK,
} from "./danh-sach-ung-vien.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI BOSS
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} [p.taskType]      — loại nhiệm vụ (mặc định call-boss)
 * @param {Array}  p.messages
 * @param {number} [p.temperature]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 */
export async function goiBoss({
  userId,
  conversationId,
  taskType = DAI_NAO_TASK.CALL_BOSS,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
}) {
  // ============================================================
  // LẤY DANH SÁCH MODEL TĨNH (ưu tiên + phụ)
  // ============================================================
  const staticModels = layDanhSachUngVien(taskType);
  if (staticModels.length === 0) {
    return { ok: false, error: `Không có model nào cho ${taskType}` };
  }

  await logInfo(`Đại Não: bắt đầu xoay ${staticModels.length} model tĩnh`, {
    userId,
    conversationId,
    taskType,
  });

  // ============================================================
  // BƯỚC 1: XOAY KEY × MODEL TĨNH
  // ============================================================
  const result1 = await xoayKeyVaModel({
    userId,
    conversationId,
    models: staticModels,
    messages,
    temperature,
    maxTokens,
    signal,
  });

  if (result1.ok) return result1;

  // ============================================================
  // BƯỚC 2: HẾT TĨNH + KEY → DÒ ĐỘNG
  // ============================================================
  await logWarn("Đại Não: hết model tĩnh + key → dò động", {
    userId,
    conversationId,
  });

  const dynamicModels = await doTatCaModelDong({ userId });

  if (dynamicModels.length === 0) {
    return { ok: false, error: "Không dò được model động nào" };
  }

  // Loại model đã thử trong bảng tĩnh
  const triedNames = new Set(
    staticModels.map((m) => `${m.provider}:${m.name}`)
  );
  const newModels = dynamicModels
    .filter((m) => !triedNames.has(`${m.provider}:${m.name}`))
    .map((m, i) => ({ name: m.name, provider: m.provider, priority: 100 + i }));

  if (newModels.length === 0) {
    return { ok: false, error: "Không có model động mới để thử" };
  }

  await logInfo(`Đại Não: xoay ${newModels.length} model động`, {
    userId,
    conversationId,
  });

  const result2 = await xoayKeyVaModel({
    userId,
    conversationId,
    models: newModels,
    messages,
    temperature,
    maxTokens,
    signal,
  });

  return result2;
}

// ============================================================
// XOAY KEY × MODEL
// ============================================================
// Thứ tự: KEY #1 → model 1,2,3... → KEY #2 → model 1,2,3... → ...

async function xoayKeyVaModel({
  userId,
  conversationId,
  models,
  messages,
  temperature,
  maxTokens,
  signal,
}) {
  // Nhóm model theo provider
  const byProvider = {};
  for (const m of models) {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m);
  }

  const errors = [];

  // Xoay từng provider
  for (const provider of Object.keys(byProvider)) {
    const mod = MODULES[provider];
    if (!mod) continue;

    const providerModels = byProvider[provider];
    const keys = await listKeysByProvider(userId, provider);
    if (!keys || keys.length === 0) continue;

    // Xoay từng KEY của provider
    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const key = keys[keyIdx];
      if (key.quota === "out") continue;

      // Với KEY này → xoay từng MODEL
      for (const model of providerModels) {
        await logInfo(`Đại Não: thử key #${keyIdx + 1} × model ${model.name}`, {
          userId,
          conversationId,
          provider,
          model: model.name,
        });

        try {
          const res = await mod.chat({
            rawKey: key.rawKey,
            model: model.name,
            messages,
            temperature,
            maxTokens,
            signal,
          });

          if (res.ok && res.text) {
            await baoCaoConDung(model.name, provider);

            const session = await createSession({
              userId,
              conversationId,
              modelName: model.name,
              provider,
              keyId: String(key._id),
            });

            await logInfo("Đại Não: BOSS THÀNH CÔNG", {
              userId,
              conversationId,
              model: model.name,
              provider,
              keyIdx: keyIdx + 1,
            });

            return {
              ok: true,
              text: res.text,
              usage: res.usage,
              session,
              boss: { name: model.name, provider },
              keyId: String(key._id),
            };
          }
        } catch (err) {
          const msg = String(err?.message || "").toLowerCase();
          const errText = err?.message || "Lỗi không rõ";

          // Lỗi quota / key sai → đánh dấu KEY hết quota → chuyển key
          if (
            msg.includes("quota") ||
            msg.includes("429") ||
            msg.includes("rate") ||
            msg.includes("exceeded")
          ) {
            await updateQuota(key._id, "out");
            await baoCaoHetQuota(model.name, provider);
            await logWarn(`Đại Não: key #${keyIdx + 1} hết quota`, {
              userId,
              keyId: String(key._id),
            });
            errors.push(`key#${keyIdx + 1}: quota`);
            break; // thoát khỏi vòng model → chuyển key tiếp
          }

          if (
            msg.includes("invalid") ||
            msg.includes("401") ||
            msg.includes("403")
          ) {
            await updateQuota(key._id, "out");
            await logWarn(`Đại Não: key #${keyIdx + 1} không hợp lệ`, {
              userId,
              keyId: String(key._id),
            });
            errors.push(`key#${keyIdx + 1}: invalid`);
            break; // thoát khỏi vòng model → chuyển key tiếp
          }

          // Lỗi khác (model lỗi) → thử model tiếp theo
          await baoCaoLoi(model.name, provider, errText);
          await logWarn(`Đại Não: model lỗi → thử model tiếp`, {
            userId,
            model: model.name,
            error: errText,
          });
          errors.push(`${model.name}: ${errText}`);
        }
      }
    }
  }

  return {
    ok: false,
    error: errors.slice(0, 5).join(" | ") || "Không gọi được BOSS",
  };
}

export default { goiBoss };