// server/tieu-nao/goi-linh.js
// Nhiệm vụ: Gọi lính.
// Thử lần lượt các lính ứng viên — không dừng ở lính chính.

import { listKeysByProvider, updateQuota } from "../db/tieuNaoKeys.js";
import { saveResult } from "../db/taskResults.js";
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
  baoLoiLamViec,
} from "./linh-dang-lam-viec.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// GỌI LÍNH — THỬ LẦN LƯỢT
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

  // Danh sách để thử lần lượt
  const tryList = Array.isArray(candidates) && candidates.length > 0
    ? candidates
    : [soldier];

  await logInfo(`Tiểu Não: bắt đầu thử ${tryList.length} lính`, {
    userId,
    taskId,
    firstSoldier: tryList[0]?.name,
  });

  // ============================================================
  // DUYỆT TỪNG LÍNH
  // ============================================================
  for (let soldierIdx = 0; soldierIdx < tryList.length; soldierIdx++) {
    const currentSoldier = tryList[soldierIdx];

    const mod = MODULES[currentSoldier.provider];
    if (!mod) {
      await logWarn(`Tiểu Não: bỏ qua lính (provider không hỗ trợ)`, {
        soldier: currentSoldier.name,
        provider: currentSoldier.provider,
      });
      continue;
    }

    const keys = await listKeysByProvider(userId, currentSoldier.provider);
    if (!keys || keys.length === 0) {
      await logInfo(`Tiểu Não: bỏ qua lính (không có key)`, {
        soldier: currentSoldier.name,
        provider: currentSoldier.provider,
      });
      continue;
    }

    await logInfo(`Tiểu Não: thử lính #${soldierIdx + 1}`, {
      userId,
      taskId,
      soldier: currentSoldier.name,
      provider: currentSoldier.provider,
    });

    const errors = [];

    // ============================================================
    // XOAY KEY CHO LÍNH NÀY
    // ============================================================
    for (let round = 0; round < LIMITS.KEY_ROTATION_MAX_ROUNDS; round++) {
      let anyAvailable = false;

      for (const key of keys) {
        if (key.quota === "out") continue;
        anyAvailable = true;

        // Tạo subtask
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

          if (res.ok) {
            await baoCaoConDung(currentSoldier.name, currentSoldier.provider);

            await saveResult({
              taskId,
              subTaskId,
              status: "success",
              output: res.text || "",
              meta: { usage: res.usage, model: currentSoldier.name },
            });

            await ketThucLamViec(subTaskId);

            await logInfo(`Tiểu Não: LÍNH THÀNH CÔNG`, {
              userId,
              taskId,
              soldier: currentSoldier.name,
              provider: currentSoldier.provider,
              subTaskId,
              position: soldierIdx + 1,
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
        } catch (err) {
          const msg = String(err?.message || "").toLowerCase();

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
              await baoCaoHetQuota(
                currentSoldier.name,
                currentSoldier.provider
              );
            }

            await saveResult({
              taskId,
              subTaskId,
              status: "error",
              output: "",
              meta: {
                error: err?.message || "Hết quota / key sai",
                model: currentSoldier.name,
              },
            });
            await baoLoiLamViec(subTaskId);

            await logWarn(`Tiểu Não: key lỗi, xoay key`, {
              userId,
              soldier: currentSoldier.name,
              keyId: String(key._id),
            });
            continue;
          }

          await baoCaoLoi(
            currentSoldier.name,
            currentSoldier.provider,
            err?.message || "Lỗi"
          );
          await saveResult({
            taskId,
            subTaskId,
            status: "error",
            output: "",
            meta: {
              error: err?.message || "Lỗi không rõ",
              model: currentSoldier.name,
            },
          });
          await baoLoiLamViec(subTaskId);
          errors.push(err?.message || "Lỗi không rõ");
        }
      }

      if (!anyAvailable) break;
    }

    // Lính này thất bại → chuyển lính tiếp theo
    await logWarn(
      `Tiểu Não: lính #${soldierIdx + 1} thất bại — chuyển lính tiếp theo`,
      {
        userId,
        soldier: currentSoldier.name,
        errors: errors.slice(0, 3),
      }
    );
  }

  // ============================================================
  // HẾT TẤT CẢ LÍNH
  // ============================================================
  await logWarn("Tiểu Não: TẤT CẢ LÍNH đều thất bại", {
    userId,
    taskId,
    totalTried: tryList.length,
  });

  return {
    ok: false,
    error: `Đã thử ${tryList.length} lính nhưng tất cả đều thất bại`,
  };
}

export default { goiLinh };