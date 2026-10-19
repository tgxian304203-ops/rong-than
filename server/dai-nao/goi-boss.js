// server/dai-nao/goi-boss.js
// Nhiệm vụ: Gọi BOSS. (Đã hỗ trợ truyền Tools)

import { listKeysByProvider, updateQuota } from "../db/daiNaoKeys.js";
import { createSession } from "../db/bossSessions.js";
import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { baoCaoConDung, baoCaoHetQuota, baoCaoLoi } from "./kiem-tra-kha-dung.js";
import { layDanhSachUngVien, doTatCaModelDong, DAI_NAO_TASK } from "./danh-sach-ung-vien.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

export async function goiBoss({
  userId, conversationId, taskType = DAI_NAO_TASK.CALL_BOSS, messages, tools, temperature = 0.7, maxTokens = 4096, signal,
}) {
  const staticModels = layDanhSachUngVien(taskType);
  if (staticModels.length === 0) return { ok: false, error: `Không có model nào cho ${taskType}` };

  const result1 = await xoayKeyVaModel({ userId, conversationId, models: staticModels, messages, tools, temperature, maxTokens, signal });
  if (result1.ok) return result1;

  const dynamicModels = await doTatCaModelDong({ userId });
  if (dynamicModels.length === 0) return { ok: false, error: "Không dò được model động nào" };

  const triedNames = new Set(staticModels.map((m) => `${m.provider}:${m.name}`));
  const newModels = dynamicModels.filter((m) => !triedNames.has(`${m.provider}:${m.name}`)).map((m, i) => ({ name: m.name, provider: m.provider, priority: 100 + i }));

  if (newModels.length === 0) return { ok: false, error: "Không có model động mới để thử" };

  return await xoayKeyVaModel({ userId, conversationId, models: newModels, messages, tools, temperature, maxTokens, signal });
}

async function xoayKeyVaModel({ userId, conversationId, models, messages, tools, temperature, maxTokens, signal }) {
  const errors = [];
  const providerKeys = {};
  
  for (const m of models) {
    if (providerKeys[m.provider] === undefined) {
      providerKeys[m.provider] = await listKeysByProvider(userId, m.provider);
    }
  }

  for (const model of models) {
    const provider = model.provider;
    const mod = MODULES[provider];
    if (!mod) continue;

    const keys = providerKeys[provider] || [];
    if (keys.length === 0) continue;

    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const key = keys[keyIdx];
      if (key.quota === "out") continue;

      try {
        const res = await mod.chat({ rawKey: key.rawKey, model: model.name, messages, tools, temperature, maxTokens, signal });

        // Thành công nếu có Text HOẶC có ToolCalls
        if (res.ok && (res.text || (res.toolCalls && res.toolCalls.length > 0))) {
          await baoCaoConDung(model.name, provider);
          const session = await createSession({ userId, conversationId, modelName: model.name, provider, keyId: String(key._id) });
          
          return {
            ok: true, text: res.text, toolCalls: res.toolCalls, usage: res.usage, session, boss: { name: model.name, provider }, keyId: String(key._id),
          };
        }
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        const errText = err?.message || "Lỗi không rõ";

        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate") || msg.includes("exceeded")) {
          await updateQuota(key._id, "out");
          await baoCaoHetQuota(model.name, provider);
          errors.push(`key#${keyIdx + 1}: quota`);
          break;
        }
        if (msg.includes("invalid") || msg.includes("401") || msg.includes("403")) {
          await updateQuota(key._id, "out");
          errors.push(`key#${keyIdx + 1}: invalid`);
          break;
        }
        await baoCaoLoi(model.name, provider, errText);
        errors.push(`${model.name}: ${errText}`);
      }
    }
  }

  return { ok: false, error: errors.slice(0, 5).join(" | ") || "Không gọi được BOSS" };
}

export default { goiBoss };