// server/tieu-nao/goi-linh.js
// Nhiệm vụ: Gọi lính lên làm việc BOSS giao.
// - Chọn key khả dụng từ nhóm Tiểu Não.
// - Xoay key khi hết quota (đủ vòng).
// - Báo cáo trạng thái vào modelHealth.
// - Tạo subtask (lính đang làm việc).

import { listKeysByProvider, updateQuota } from "../db/tieuNaoKeys.js";
import { saveResult } from "../db/taskResults.js";
import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { baoCaoConDung, baoCaoHetQuota, baoCaoLoi } from "./kiem-tra-kha-dung.js";
import { batDauLamViec, ketThucLamViec, baoLoiLamViec } from "./linh-dang-lam-viec.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI LÍNH
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.taskId          - _id của task BOSS đã tạo
 * @param {object} p.soldier         - { name, provider }
 * @param {Array}  p.messages        - tin nhắn cho lính
 * @param {object} p.payload         - format BOSS giao (để lưu vào subtask)
 * @param {number} [p.temperature]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, text?: string, usage?: object, subTaskId?: string, keyId?: string, error?: string}>}
 */
export async function goiLinh({
  userId,
  taskId,
  soldier,
  messages,
  payload,
  temperature = 0.5,
  maxTokens = 4096,
  signal,
}) {
  if (!soldier || !soldier.name || !soldier.provider) {
    return { ok: false, error: "Thiếu thông tin lính" };
  }

  const mod = MODULES[soldier.provider];
  if (!mod) {
    return { ok: false, error: `Chưa hỗ trợ provider ${soldier.provider}` };
  }

  const keys = await listKeysByProvider(userId, soldier.provider);
  if (!keys || keys.length === 0) {
    return {
      ok: false,
      error: `Không có key Tiểu Não nào cho ${soldier.provider}`,
    };
  }

  const errors = [];

  // Xoay key đủ vòng
  for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
    let anyAvailable = false;

    for (const key of keys) {
      if (key.quota === "out") continue;
      anyAvailable = true;

      // Tạo subtask — lính đang làm việc
      const sub = await batDauLamViec({
        taskId,
        soldierModel: soldier.name,
        soldierProvider: soldier.provider,
        soldierKeyId: String(key._id),
        payload,
      });
      const subTaskId = String(sub._id);

      try {
        const res = await mod.chat({
          rawKey: key.rawKey,
          model: soldier.name,
          messages,
          temperature,
          maxTokens,
          signal,
        });

        if (res.ok) {
          await baoCaoConDung(soldier.name, soldier.provider);

          // Ghi kết quả subtask
          await saveResult({
            taskId,
            subTaskId,
            status: "success",
            output: res.text || "",
            meta: { usage: res.usage, model: soldier.name },
          });

          await ketThucLamViec(subTaskId);

          await logInfo("Gọi lính thành công", {
            userId,
            taskId,
            soldier: soldier.name,
            provider: soldier.provider,
            subTaskId,
          });

          return {
            ok: true,
            text: res.text,
            usage: res.usage,
            subTaskId,
            keyId: String(key._id),
          };
        }
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();

        // Lỗi quota → đánh dấu key hết, ghi subtask lỗi, thử key khác
        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
          await updateQuota(key._id, "out");
          await baoCaoHetQuota(soldier.name, soldier.provider);
          await saveResult({
            taskId,
            subTaskId,
            status: "error",
            output: "",
            meta: { error: err?.message || "Hết quota", model: soldier.name },
          });
          await baoLoiLamViec(subTaskId);
          await logWarn("Key Tiểu Não hết quota khi gọi lính", {
            keyId: String(key._id),
            soldier: soldier.name,
          });
          continue;
        }

        // Lỗi key sai
        if (
          msg.includes("invalid") ||
          msg.includes("401") ||
          msg.includes("403")
        ) {
          await updateQuota(key._id, "out");
          await baoLoiLamViec(subTaskId);
          await logWarn("Key Tiểu Não không hợp lệ", {
            keyId: String(key._id),
          });
          continue;
        }

        // Lỗi khác
        await baoCaoLoi(soldier.name, soldier.provider, err?.message || "Lỗi");
        await saveResult({
          taskId,
          subTaskId,
          status: "error",
          output: "",
          meta: { error: err?.message || "Lỗi không rõ", model: soldier.name },
        });
        await baoLoiLamViec(subTaskId);
        errors.push(err?.message || "Lỗi không rõ");
      }
    }

    if (!anyAvailable) break;
  }

  return {
    ok: false,
    error: errors.join(" | ") || "Không gọi được lính",
  };
}

export default { goiLinh };