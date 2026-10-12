// server/dai-nao/phan-loai-yeu-cau.js
// Nhiệm vụ: Phân loại yêu cầu User để biết cần xử lý loại gì.
// Phân loại dùng model openai/gpt-oss-120b (ưu tiên 1) hoặc
// meta-llama/llama-4-maverick-17b-128e-instruct (ưu tiên 2).

import { DAI_NAO_TASK, layDanhSachUngVien } from "./danh-sach-ung-vien.js";
import { locUngVien } from "./loc-ung-vien.js";
import { layModelDangSuDung, datModelDangSuDung } from "./model-dang-su-dung.js";
import { listKeysByProvider } from "../db/daiNaoKeys.js";
import { baoCaoConDung, baoCaoLoi } from "./kiem-tra-kha-dung.js";
import groq from "../providers/groq.js";
import gemini from "../providers/gemini.js";
import openrouter from "../providers/openrouter.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

const MODULES = { groq, gemini, openrouter };

// ============================================================
// LOẠI YÊU CẦU CHUẨN
// ============================================================

export const LOAI_YEU_CAU = {
  NO_WEB_NO_CODE: "no_web_no_code", // luồng 1
  NEED_WEB: "need_web",             // luồng 2
  NEED_CODE: "need_code",           // luồng 3
};

// ============================================================
// PROMPT
// ============================================================

function buildClassifyPrompt(userRequest) {
  return [
    {
      role: "system",
      content:
        "Bạn là bộ phân loại yêu cầu của Rồng Thần. " +
        "Đọc yêu cầu người dùng và trả về DUY NHẤT 1 trong 3 nhãn: " +
        "no_web_no_code | need_web | need_code. " +
        "Không giải thích, không thêm chữ nào khác.",
    },
    { role: "user", content: userRequest },
  ];
}

// ============================================================
// PHÂN LOẠI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.userRequest
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ok: boolean, label: string, model?: string, error?: string}>}
 */
export async function phanLoaiYeuCau({ userId, userRequest, signal }) {
  // Ưu tiên model đang sử dụng nếu có
  let candidates = layDanhSachUngVien(DAI_NAO_TASK.CLASSIFY);
  const active = await layModelDangSuDung(DAI_NAO_TASK.CLASSIFY);
  if (active && active.name) {
    candidates = [
      { name: active.name, provider: active.provider, priority: 0 },
      ...candidates.filter(
        (c) => !(c.name === active.name && c.provider === active.provider)
      ),
    ];
  }

  const filtered = await locUngVien(candidates);
  if (filtered.length === 0) {
    return { ok: false, label: "", error: "Không có model ứng viên nào" };
  }

  const prompt = buildClassifyPrompt(userRequest);

  for (const model of filtered) {
    const keys = await listKeysByProvider(userId, model.provider);
    const usable = keys.filter((k) => k.quota !== "out");
    if (usable.length === 0) continue;

    const mod = MODULES[model.provider];
    if (!mod) continue;

    for (const key of usable) {
      try {
        const res = await mod.chat({
          rawKey: key.rawKey,
          model: model.name,
          messages: prompt,
          temperature: 0,
          maxTokens: 20,
          signal,
        });

        const label = String(res.text || "").trim().toLowerCase();

        if (
          label === LOAI_YEU_CAU.NO_WEB_NO_CODE ||
          label === LOAI_YEU_CAU.NEED_WEB ||
          label === LOAI_YEU_CAU.NEED_CODE
        ) {
          await baoCaoConDung(model.name, model.provider);
          await datModelDangSuDung(DAI_NAO_TASK.CLASSIFY, model.name);
          await logInfo("Đại Não phân loại xong", {
            userId,
            label,
            model: model.name,
          });
          return { ok: true, label, model: model.name };
        }

        // Nhãn lạ → thử model khác
        await logWarn("Đại Não phân loại trả về nhãn lạ", {
          label,
          model: model.name,
        });
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("quota") || msg.includes("429")) {
          await baoCaoLoi(model.name, model.provider, "Hết quota");
          continue;
        }
        await baoCaoLoi(model.name, model.provider, err?.message || "Lỗi");
      }
    }
  }

  return { ok: false, label: "", error: "Không phân loại được yêu cầu" };
}

export default {
  LOAI_YEU_CAU,
  phanLoaiYeuCau,
};