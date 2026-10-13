// server/tieu-nao/goi-linh.js
// Nhiệm vụ: Gọi lính — thử lần lượt, dò động khi hết.
// Log chi tiết lý do thất bại.

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
import { doTatCaModelDong } from "./danh-sach-ung-vien.js";
import { layDiemSucManh } from "./bang-xep-hang-model.js";
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
  soldier,
  candidates = null,
  messages,
  payload,
  temperature = 0.5,
  maxTokens = 4096,
  signal,
  taskType = null,
}) {
  if (!soldier || !soldier.name || !soldier.provider) {
    return { ok: false, error: "Thiếu thông tin lính" };
  }

  const tryList =
    Array.isArray(candidates) && candidates.length > 0
      ? candidates
      : [soldier];

  await logInfo(`Tiểu Não: bắt đầu thử ${tryList.length} lính`, {
    userId,
    taskId,
    firstSoldier: tryList[0]?.name,
  });

  const errorHistory = [];
  const triedKeys = new Set();

  // ============================================================
  // BƯỚC 1: THỬ CÁC ỨNG VIÊN TĨNH
  // ============================================================
  for (let soldierIdx = 0; soldierIdx < tryList.length; soldierIdx++) {
    const currentSoldier = tryList[soldierIdx];
    triedKeys.add(`${currentSoldier.provider}:${currentSoldier.name}`);

    const result = await tryOneSoldier({
      userId,
      taskId,
      currentSoldier,
      messages,
      payload,
      temperature,
      maxTokens,
      signal,
      position: soldierIdx + 1,
    });

    if (result.ok) {
      await cleanupFailedSubTasks(taskId, result.subTaskId);
      return {
        ok: true,
        text: result.text,
        usage: result.usage,
        subTaskId: result.subTaskId,
        soldier: currentSoldier,
        keyId: result.keyId,
      };
    }

    errorHistory.push({
      soldier: currentSoldier.name,
      provider: currentSoldier.provider,
      reason: result.reason,
      detail: result.detail,
    });

    await logWarn(
      `Tiểu Não: lính #${soldierIdx + 1} (${currentSoldier.name}) thất bại — lý do: "${result.reason}"`,
      {
        userId,
        soldier: currentSoldier.name,
        provider: currentSoldier.provider,
        reason: result.reason,
        detail: result.detail,
      }
    );
  }

  // ============================================================
  // BƯỚC 2: DÒ ĐỘNG TẤT CẢ MODEL KHI HẾT TĨNH
  // ============================================================
  await logWarn(
    `Tiểu Não: hết ứng viên tĩnh (${tryList.length}) — dò động tất cả model`,
    { userId, taskId }
  );

  const dynamic = await doTatCaModelDong({ userId });

  // Sắp xếp theo sức mạnh
  const withScore = dynamic
    .filter((d) => !triedKeys.has(`${d.provider}:${d.name}`))
    .map((d) => ({
      ...d,
      _score: layDiemSucManh(d.name, taskType),
    }))
    .sort((a, b) => b._score - a._score);

  await logInfo(`Tiểu Não: dò động được ${withScore.length} model mới`, {
    userId,
    top10: withScore.slice(0, 10).map((c) => `${c.name} (${c.provider})`),
  });

  // ============================================================
  // BƯỚC 3: THỬ CÁC MODEL ĐỘNG
  // ============================================================
  for (let i = 0; i < withScore.length; i++) {
    const currentSoldier = {
      name: withScore[i].name,
      provider: withScore[i].provider,
      priority: 99,
      _dynamic: true,
    };

    const result = await tryOneSoldier({
      userId,
      taskId,
      currentSoldier,
      messages,
      payload,
      temperature,
      maxTokens,
      signal,
      position: `dyn#${i + 1}`,
    });

    if (result.ok) {
      await cleanupFailedSubTasks(taskId, result.subTaskId);
      await logInfo(
        `Tiểu Não: LÍNH ĐỘNG THÀNH CÔNG (${currentSoldier.name})`,
        { userId, taskId }
      );

      return {
        ok: true,
        text: result.text,
        usage: result.usage,
        subTaskId: result.subTaskId,
        soldier: currentSoldier,
        keyId: result.keyId,
      };
    }

    errorHistory.push({
      soldier: currentSoldier.name,
      provider: currentSoldier.provider,
      reason: result.reason,
      detail: result.detail,
    });

    // Chỉ log 3 model động đầu tiên để tránh spam
    if (i < 3 || i % 5 === 0) {
      await logWarn(
        `Tiểu Não: lính động (${currentSoldier.name}) thất bại — lý do: "${result.reason}"`,
        {
          userId,
          soldier: currentSoldier.name,
          provider: currentSoldier.provider,
          reason: result.reason,
        }
      );
    }
  }

  // ============================================================
  // HẾT SẠCH
  // ============================================================
  await cleanupFailedSubTasks(taskId, null);

  await logWarn("Tiểu Não: TẤT CẢ LÍNH đều thất bại", {
    userId,
    taskId,
    totalTried: errorHistory.length,
    reasons: errorHistory.slice(0, 5).map(
      (h) => `${h.soldier}: ${h.reason}`
    ),
  });

  return {
    ok: false,
    error: `Đã thử ${errorHistory.length} lính nhưng tất cả đều thất bại`,
    errorHistory,
  };
}

// ============================================================
// THỬ 1 LÍNH
// ============================================================

async function tryOneSoldier({
  userId,
  taskId,
  currentSoldier,
  messages,
  payload,
  temperature,
  maxTokens,
  signal,
  position,
}) {
  const mod = MODULES[currentSoldier.provider];
  if (!mod) {
    return { ok: false, reason: "Provider không hỗ trợ", detail: currentSoldier.provider };
  }

  const keys = await listKeysByProvider(userId, currentSoldier.provider);
  if (!keys || keys.length === 0) {
    return { ok: false, reason: "Không có key", detail: currentSoldier.provider };
  }

  const errors = [];

  for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
    let anyAvailable = false;

    for (const key of keys) {
      if (key.quota === "out") continue;
      anyAvailable = true;

      const sub = await batDauLamViec({
        taskId,
        soldierModel: currentSoldier.name,
        soldierProvider: currentSoldier.provider,
        soldierKeyId: String(key._id),
        payload,
      });
      const subTaskId = String(sub._id);

      try {
        const res = await mod.chat({
          rawKey: key.rawKey,
          model: currentSoldier.name,
          messages,
          temperature,
          maxTokens,
          signal,
        });

        if (res.ok && res.text) {
          await baoCaoConDung(currentSoldier.name, currentSoldier.provider);

          await saveResult({
            taskId,
            subTaskId,
            status: "success",
            output: res.text,
            meta: {
              usage: res.usage,
              model: currentSoldier.name,
              position,
            },
          });

          await ketThucLamViec(subTaskId);

          return {
            ok: true,
            text: res.text,
            usage: res.usage,
            subTaskId,
            keyId: String(key._id),
          };
        }

        // Không có output
        const errMsg = res.error || "Không có output";
        await saveResult({
          taskId,
          subTaskId,
          status: "error",
          output: res.text || "",
          meta: { error: errMsg, model: currentSoldier.name },
        });
        await setSubTaskStatus(subTaskId, "skipped");
        errors.push(errMsg);

        return {
          ok: false,
          reason: classifyError(errMsg),
          detail: errMsg,
        };
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        const errText = err?.message || "Lỗi không rõ";

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
            await baoCaoHetQuota(currentSoldier.name, currentSoldier.provider);
          }

          await saveResult({
            taskId,
            subTaskId,
            status: "error",
            output: "",
            meta: { error: errText, model: currentSoldier.name },
          });
          await setSubTaskStatus(subTaskId, "skipped");
          errors.push(errText);
          continue;
        }

        await baoCaoLoi(
          currentSoldier.name,
          currentSoldier.provider,
          errText
        );
        await saveResult({
          taskId,
          subTaskId,
          status: "error",
          output: "",
          meta: { error: errText, model: currentSoldier.name },
        });
        await setSubTaskStatus(subTaskId, "skipped");
        errors.push(errText);

        return {
          ok: false,
          reason: classifyError(errText),
          detail: errText,
        };
      }
    }

    if (!anyAvailable) break;
  }

  return {
    ok: false,
    reason: "Hết key khả dụng",
    detail: errors.slice(0, 2).join(" | "),
  };
}

// ============================================================
// PHÂN LOẠI LỖI
// ============================================================

function classifyError(errMsg) {
  const m = String(errMsg || "").toLowerCase();

  if (m.includes("context") && m.includes("long")) return "Context too long";
  if (m.includes("context") && m.includes("length")) return "Context too long";
  if (m.includes("token") && m.includes("limit")) return "Token limit";
  if (m.includes("too many tokens")) return "Token limit";
  if (m.includes("quota")) return "Hết quota";
  if (m.includes("429") || m.includes("rate")) return "Rate limit";
  if (m.includes("401") || m.includes("403")) return "Key không hợp lệ";
  if (m.includes("timeout")) return "Timeout";
  if (m.includes("network") || m.includes("fetch")) return "Lỗi mạng";
  if (m.includes("500") || m.includes("502") || m.includes("503")) return "Server provider lỗi";
  if (m.includes("model") && m.includes("not")) return "Model không tồn tại";
  if (m.includes("max") && m.includes("token")) return "Vượt max_tokens";

  return "Lỗi không rõ";
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