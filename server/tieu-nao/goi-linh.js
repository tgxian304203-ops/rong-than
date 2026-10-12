// server/tieu-nao/goi-linh.js
// Nhiệm vụ: Gọi lính.
// Khi lính #1 lỗi → lính #2 nhận lỗi + prompt gốc → tiếp tục, không làm lại vô thức.

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
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI LÍNH — THỬ LẦN LƯỢT VỚI NGỮ CẢNH TÍCH LŨY
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

  // Lịch sử lỗi — tích lũy qua từng lính
  const errorHistory = [];

  // ============================================================
  // DUYỆT TỪNG LÍNH
  // ============================================================
  for (let soldierIdx = 0; soldierIdx < tryList.length; soldierIdx++) {
    const currentSoldier = tryList[soldierIdx];

    const mod = MODULES[currentSoldier.provider];
    if (!mod) {
      errorHistory.push({
        soldier: currentSoldier.name,
        provider: currentSoldier.provider,
        reason: "Provider không hỗ trợ",
      });
      await logWarn(`Tiểu Não: bỏ qua lính (provider không hỗ trợ)`, {
        soldier: currentSoldier.name,
      });
      continue;
    }

    const keys = await listKeysByProvider(userId, currentSoldier.provider);
    if (!keys || keys.length === 0) {
      errorHistory.push({
        soldier: currentSoldier.name,
        provider: currentSoldier.provider,
        reason: "Không có key",
      });
      await logInfo(`Tiểu Não: bỏ qua lính (không có key)`, {
        soldier: currentSoldier.name,
      });
      continue;
    }

    await logInfo(`Tiểu Não: thử lính #${soldierIdx + 1}`, {
      userId,
      taskId,
      soldier: currentSoldier.name,
      provider: currentSoldier.provider,
      hasErrorHistory: errorHistory.length > 0,
    });

    // ============================================================
    // XÂY MESSAGES CÓ NGỮ CẢNH TỪ LÍNH TRƯỚC
    // ============================================================
    const messagesWithContext =
      errorHistory.length > 0
        ? buildMessagesWithHistory(messages, errorHistory, soldierIdx)
        : messages;

    // ============================================================
    // XOAY KEY
    // ============================================================
    let lastOutput = "";
    const localErrors = [];

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
            messages: messagesWithContext,
            temperature,
            maxTokens,
            signal,
          });

          if (res.ok && res.text) {
            // ===== THÀNH CÔNG =====
            await baoCaoConDung(currentSoldier.name, currentSoldier.provider);

            await saveResult({
              taskId,
              subTaskId,
              status: "success",
              output: res.text,
              meta: {
                usage: res.usage,
                model: currentSoldier.name,
                position: soldierIdx + 1,
              },
            });

            await ketThucLamViec(subTaskId);

            // Dọn subtask lỗi trước đó
            await cleanupFailedSubTasks(taskId, subTaskId);

            await logInfo(`Tiểu Não: LÍNH THÀNH CÔNG`, {
              userId,
              taskId,
              soldier: currentSoldier.name,
              provider: currentSoldier.provider,
              position: soldierIdx + 1,
              hadContext: errorHistory.length > 0,
            });

            return {
              ok: true,
              text: res.text,
              usage: res.usage,
              subTaskId,
              soldier: currentSoldier,
              keyId: String(key._id),
            };
          }

          // Không có output hoặc lỗi
          const errMsg = res.error || "Không rõ";
          lastOutput = res.text || "";

          await saveResult({
            taskId,
            subTaskId,
            status: "error",
            output: lastOutput,
            meta: {
              error: errMsg,
              model: currentSoldier.name,
              position: soldierIdx + 1,
            },
          });
          await setSubTaskStatus(subTaskId, "skipped");

          localErrors.push(errMsg);
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

            if (
              msg.includes("quota") ||
              msg.includes("429") ||
              msg.includes("rate")
            ) {
              await baoCaoHetQuota(
                currentSoldier.name,
                currentSoldier.provider
              );
            }

            await saveResult({
              taskId,
              subTaskId,
              status: "error",
              output: lastOutput,
              meta: {
                error: errText,
                model: currentSoldier.name,
                position: soldierIdx + 1,
              },
            });
            await setSubTaskStatus(subTaskId, "skipped");

            localErrors.push(errText);

            await logWarn(`Tiểu Não: key lỗi, xoay key`, {
              userId,
              soldier: currentSoldier.name,
              keyId: String(key._id),
            });
            continue;
          }

          // Lỗi khác
          await baoCaoLoi(
            currentSoldier.name,
            currentSoldier.provider,
            errText
          );
          await saveResult({
            taskId,
            subTaskId,
            status: "error",
            output: lastOutput,
            meta: {
              error: errText,
              model: currentSoldier.name,
              position: soldierIdx + 1,
            },
          });
          await setSubTaskStatus(subTaskId, "skipped");
          localErrors.push(errText);
        }
      }

      if (!anyAvailable) break;
    }

    // Lính này thất bại → ghi vào lịch sử
    errorHistory.push({
      soldier: currentSoldier.name,
      provider: currentSoldier.provider,
      errors: localErrors.slice(0, 3),
      partialOutput: lastOutput.slice(0, 500), // tối đa 500 ký tự
    });

    await logWarn(
      `Tiểu Não: lính #${soldierIdx + 1} thất bại — chuyển lính tiếp theo (có ngữ cảnh)`,
      {
        userId,
        soldier: currentSoldier.name,
        errors: localErrors.slice(0, 3),
      }
    );
  }

  // ============================================================
  // HẾT TẤT CẢ LÍNH — DỌN
  // ============================================================
  await cleanupFailedSubTasks(taskId, null);

  await logWarn("Tiểu Não: TẤT CẢ LÍNH đều thất bại", {
    userId,
    taskId,
    totalTried: tryList.length,
    errorHistory,
  });

  return {
    ok: false,
    error: `Đã thử ${tryList.length} lính nhưng tất cả đều thất bại`,
    errorHistory,
  };
}

// ============================================================
// XÂY MESSAGES CÓ NGỮ CẢNH LÍNH TRƯỚC
// ============================================================

function buildMessagesWithHistory(baseMessages, errorHistory, soldierIdx) {
  if (!errorHistory || errorHistory.length === 0) return baseMessages;

  const lines = [
    `[NGỮ CẢNH TỪ ${errorHistory.length} LÍNH TRƯỚC]`,
    `Bạn là lính #${soldierIdx + 1}. Các lính trước đã thất bại.`,
    "",
    "Lịch sử lỗi:",
  ];

  errorHistory.forEach((h, i) => {
    lines.push(`- Lính #${i + 1} (${h.soldier}):`);
    if (h.errors && h.errors.length > 0) {
      h.errors.forEach((e) => lines.push(`  + Lỗi: ${e}`));
    }
    if (h.partialOutput && h.partialOutput.trim()) {
      lines.push(`  + Output dở (không hoàn chỉnh):`);
      lines.push("  ```");
      lines.push("  " + h.partialOutput.slice(0, 300).replace(/\n/g, "\n  "));
      lines.push("  ```");
    }
  });

  lines.push(
    "",
    "Hãy hoàn thành nhiệm vụ gốc bên dưới.",
    "LƯU Ý:",
    "- Nếu lính trước để lại output dở → có thể tiếp tục từ đó.",
    "- Nếu không có output → làm lại nhưng TRÁNH các lỗi trên.",
    "- Trả về kết quả hoàn chỉnh, đúng yêu cầu."
  );

  const contextMsg = {
    role: "user",
    content: lines.join("\n"),
  };

  return [...baseMessages, contextMsg];
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