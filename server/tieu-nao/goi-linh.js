// server/tieu-nao/goi-linh.js
// Nhiệm vụ: Gọi lính.
//
// LOGIC XOAY:
//   1. Với mỗi KEY → xoay HẾT model trong candidates (ưu tiên + phụ).
//   2. Hết model → xoay KEY tiếp theo → lặp.
//   3. Hết TẤT CẢ key + model tĩnh → dò động model.

import { listKeysByProvider, updateQuota } from "../db/tieuNaoKeys.js";
import { saveResult } from "../db/taskResults.js";
import {
  setStatus as setSubTaskStatus,
  listByTask as listSubTasks,
} from "../db/subBrainTasks.js";
import { LIMITS } from "../config/limits.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import {
  baoCaoConDung,
  baoCaoHetQuota,
  baoCaoLoi,
} from "./kiem-tra-kha-dung.js";
import {
  batDauLamViec,
  ketThucLamViec,
} from "./linh-dang-lam-viec.js";
import {
  layDanhSachUngVien,
  doTatCaModelDong,
} from "./danh-sach-ung-vien.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI LÍNH
// ============================================================

export async function goiLinh({
  userId,
  taskId,
  taskType,
  messages,
  payload,
  temperature = 0.5,
  maxTokens = 4096,
  signal,
}) {
  // ============================================================
  // LẤY MODEL TĨNH
  // ============================================================
  const staticModels = layDanhSachUngVien(taskType);
  if (staticModels.length === 0) {
    return { ok: false, error: `Không có model nào cho ${taskType}` };
  }

  await logInfo(`Tiểu Não: bắt đầu xoay ${staticModels.length} model tĩnh`, {
    userId,
    taskId,
    taskType,
  });

  // ============================================================
  // BƯỚC 1: XOAY KEY × MODEL TĨNH
  // ============================================================
  const result1 = await xoayKeyVaModel({
    userId,
    taskId,
    models: staticModels,
    messages,
    payload,
    temperature,
    maxTokens,
    signal,
  });

  if (result1.ok) return result1;

  // ============================================================
  // BƯỚC 2: HẾT TĨNH → DÒ ĐỘNG
  // ============================================================
  await logWarn("Tiểu Não: hết model tĩnh + key → dò động", {
    userId,
    taskId,
  });

  const dynamicModels = await doTatCaModelDong({ userId });

  if (dynamicModels.length === 0) {
    return { ok: false, error: "Không dò được model động nào" };
  }

  const triedNames = new Set(
    staticModels.map((m) => `${m.provider}:${m.name}`)
  );
  const newModels = dynamicModels
    .filter((m) => !triedNames.has(`${m.provider}:${m.name}`))
    .map((m, i) => ({ name: m.name, provider: m.provider, priority: 100 + i }));

  if (newModels.length === 0) {
    return { ok: false, error: "Không có model động mới" };
  }

  await logInfo(`Tiểu Não: xoay ${newModels.length} model động`, {
    userId,
    taskId,
  });

  const result2 = await xoayKeyVaModel({
    userId,
    taskId,
    models: newModels,
    messages,
    payload,
    temperature,
    maxTokens,
    signal,
  });

  return result2;
}

// ============================================================
// XOAY KEY × MODEL
// ============================================================
// Thứ tự: PRIORITY 1 → PRIORITY 2 → ...

async function xoayKeyVaModel({
  userId,
  taskId,
  models,
  messages,
  payload,
  temperature,
  maxTokens,
  signal,
}) {
  const errors = [];
  
  // Tối ưu: Lấy sẵn key của các provider để không gọi DB nhiều lần
  const providerKeys = {};
  for (const m of models) {
    if (providerKeys[m.provider] === undefined) {
      providerKeys[m.provider] = await listKeysByProvider(userId, m.provider);
    }
  }

  // Duyệt ĐÚNG THEO THỨ TỰ PRIORITY (1, 2, 3, 4...)
  for (const model of models) {
    const provider = model.provider;
    const mod = MODULES[provider];
    if (!mod) continue;

    const keys = providerKeys[provider] || [];
    if (keys.length === 0) continue;

    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const key = keys[keyIdx];
      if (key.quota === "out") continue;

      await logInfo(`Tiểu Não: thử key #${keyIdx + 1} × model ${model.name}`, {
        userId,
        taskId,
        provider,
        model: model.name,
      });

      // Tạo subtask
      const sub = await batDauLamViec({
        taskId,
        soldierModel: model.name,
        soldierProvider: provider,
        soldierKeyId: String(key._id),
        payload,
      });
      const subTaskId = String(sub._id);

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

          await saveResult({
            taskId,
            subTaskId,
            status: "success",
            output: res.text,
            meta: { usage: res.usage, model: model.name },
          });

          await ketThucLamViec(subTaskId);
          await cleanupFailedSubTasks(taskId, subTaskId);

          await logInfo("Tiểu Não: LÍNH THÀNH CÔNG", {
            userId,
            taskId,
            model: model.name,
            provider,
            keyIdx: keyIdx + 1,
          });

          return {
            ok: true,
            text: res.text,
            usage: res.usage,
            subTaskId,
            soldier: { name: model.name, provider },
            keyId: String(key._id),
          };
        }
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        const errText = err?.message || "Lỗi không rõ";

        // Quota → đánh dấu key hết
        if (
          msg.includes("quota") ||
          msg.includes("429") ||
          msg.includes("rate") ||
          msg.includes("exceeded")
        ) {
          await updateQuota(key._id, "out");
          await baoCaoHetQuota(model.name, provider);

          await saveResult({
            taskId,
            subTaskId,
            status: "error",
            output: "",
            meta: { error: errText, model: model.name },
          });
          await setSubTaskStatus(subTaskId, "skipped");

          await logWarn(`Tiểu Não: key #${keyIdx + 1} hết quota`, {
            userId,
            keyId: String(key._id),
          });
          errors.push(`key#${keyIdx + 1}: quota`);
          break; // chuyển key
        }

        if (
          msg.includes("invalid") ||
          msg.includes("401") ||
          msg.includes("403")
        ) {
          await updateQuota(key._id, "out");
          await setSubTaskStatus(subTaskId, "skipped");
          await logWarn(`Tiểu Não: key #${keyIdx + 1} không hợp lệ`, {
            userId,
            keyId: String(key._id),
          });
          errors.push(`key#${keyIdx + 1}: invalid`);
          break;
        }

        // Lỗi model → thử model tiếp
        await baoCaoLoi(model.name, provider, errText);
        await saveResult({
          taskId,
          subTaskId,
          status: "error",
          output: "",
          meta: { error: errText, model: model.name },
        });
        await setSubTaskStatus(subTaskId, "skipped");
        errors.push(`${model.name}: ${errText}`);
      }
    }
  }

  return {
    ok: false,
    error: errors.slice(0, 5).join(" | ") || "Không gọi được lính",
  };
}

// ============================================================
// DỌN SUBTASK LỖI
// ============================================================

async function cleanupFailedSubTasks(taskId, keepSubTaskId) {
  try {
    const subs = await listSubTasks(taskId);
    for (const s of subs) {
      const sid = String(s._id);
      if (keepSubTaskId && sid === keepSubTaskId) continue;
      if (s.status === "error") {
        await setSubTaskStatus(sid, "skipped");
      }
    }
  } catch {
    /* bỏ qua */
  }
}

export default { goiLinh };