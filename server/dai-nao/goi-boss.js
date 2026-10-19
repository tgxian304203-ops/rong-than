// server/dai-nao/goi-boss.js
// Nhiệm vụ: Gọi BOSS.
// Đã sửa: Thêm log chi tiết, xoay vòng theo Priority, xử lý text rỗng.

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
export async function goiBoss({
  userId, conversationId, taskType = DAI_NAO_TASK.CALL_BOSS, messages, tools, temperature = 0.7, maxTokens = 4096, signal,
}) {
  const staticModels = layDanhSachUngVien(taskType);
  if (staticModels.length === 0) {
    return { ok: false, error: `Không có model nào cho ${taskType}` };
  }

  await logInfo(`Đại Não: bắt đầu xoay ${staticModels.length} model tĩnh`, {
    userId, conversationId, taskType,
  });

  const result1 = await xoayKeyVaModel({
    userId, conversationId, models: staticModels, messages, tools, temperature, maxTokens, signal,
  });

  if (result1.ok) return result1;

  await logWarn("Đại Não: hết model tĩnh + key → dò động", { userId, conversationId });

  const dynamicModels = await doTatCaModelDong({ userId });

  if (dynamicModels.length === 0) {
    return { ok: false, error: "Không dò được model động nào" };
  }

  const triedNames = new Set(staticModels.map((m) => `${m.provider}:${m.name}`));
  const newModels = dynamicModels
    .filter((m) => !triedNames.has(`${m.provider}:${m.name}`))
    .map((m, i) => ({ name: m.name, provider: m.provider, priority: 100 + i }));

  if (newModels.length === 0) {
    return { ok: false, error: "Không có model động mới để thử" };
  }

  await logInfo(`Đại Não: xoay ${newModels.length} model động`, { userId, conversationId });

  const result2 = await xoayKeyVaModel({
    userId, conversationId, models: newModels, messages, tools, temperature, maxTokens, signal,
  });

  return result2;
}

// ============================================================
// XOAY KEY × MODEL (Đã thêm log chi tiết)
// ============================================================
async function xoayKeyVaModel({
  userId, conversationId, models, messages, tools, temperature, maxTokens, signal,
}) {
  const errors = [];
  const providerKeys = {};
  
  // Lấy key 1 lần cho mỗi provider
  for (const m of models) {
    if (providerKeys[m.provider] === undefined) {
      providerKeys[m.provider] = await listKeysByProvider(userId, m.provider);
    }
  }

  // Duyệt theo đúng thứ tự Priority
  for (const model of models) {
    const provider = model.provider;
    const mod = MODULES[provider];
    
    if (!mod) { 
      await logWarn(`Đại Não: bỏ qua provider không hỗ trợ "${provider}"`, { userId });
      continue; 
    }

    const keys = providerKeys[provider] || [];
    if (keys.length === 0) { 
      await logWarn(`Đại Não: KHÔNG CÓ KEY cho provider "${provider}" (user chưa nhập key)`, { userId, provider });
      continue; 
    }

    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const key = keys[keyIdx];
      if (key.quota === "out") {
        await logInfo(`Đại Não: bỏ qua key #${keyIdx + 1} (${provider}) — đã out quota`, { userId, provider });
        continue;
      }

      await logInfo(`Đại Não: thử key #${keyIdx + 1} × model ${model.name}`, {
        userId, provider, model: model.name,
      });

      try {
        const res = await mod.chat({
          rawKey: key.rawKey, model: model.name, messages, tools, temperature, maxTokens, signal,
        });

        if (res.ok && (res.text || (res.toolCalls && res.toolCalls.length > 0))) {
          await baoCaoConDung(model.name, provider);
          const session = await createSession({
            userId, conversationId, modelName: model.name, provider, keyId: String(key._id),
          });
          await logInfo("Đại Não: BOSS THÀNH CÔNG", {
            userId, provider, model: model.name, keyIdx: keyIdx + 1,
            hasToolCalls: !!(res.toolCalls && res.toolCalls.length > 0),
          });
          return {
            ok: true, text: res.text, toolCalls: res.toolCalls, usage: res.usage, 
            session, boss: { name: model.name, provider }, keyId: String(key._id),
          };
        } else if (res.ok) {
          // res.ok nhưng text rỗng và không có toolCalls
          const warn = `${model.name} (${provider}): text rỗng, không có toolCalls`;
          await logWarn(`Đại Não: ${warn}`, { userId, provider, model: model.name });
          errors.push(warn);
        }
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        const errText = err?.message || "Lỗi không rõ";

        await logWarn(`Đại Não: model ${model.name} (${provider}) LỖI`, {
          userId, error: errText.slice(0, 300),
        });

        // Lỗi quota
        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate") || msg.includes("exceeded")) {
          await updateQuota(key._id, "out");
          await baoCaoHetQuota(model.name, provider);
          await logWarn(`Đại Não: key #${keyIdx + 1} (${provider}) HẾT QUOTA → đánh dấu out`, { userId });
          errors.push(`key#${keyIdx + 1} ${provider}: hết quota`);
          break;
        }
        // Lỗi key sai
        if (msg.includes("invalid") || msg.includes("401") || msg.includes("403")) {
          await updateQuota(key._id, "out");
          await logWarn(`Đại Não: key #${keyIdx + 1} (${provider}) KHÔNG HỢP LỆ → đánh dấu out`, { userId });
          errors.push(`key#${keyIdx + 1} ${provider}: key sai`);
          break;
        }
        
        // Lỗi model (404, 400, timeout...)
        await baoCaoLoi(model.name, provider, errText);
        errors.push(`${model.name} (${provider}): ${errText.slice(0, 150)}`);
      }
    }
  }

  await logWarn("Đại Não: TẤT CẢ MODEL ĐỀU FAIL", { 
    userId, 
    totalErrors: errors.length,
    firstErrors: errors.slice(0, 10),
  });

  return {
    ok: false,
    error: errors.slice(0, 5).join(" | ") || "Không gọi được BOSS — không có lỗi cụ thể",
  };
}

export default { goiBoss };