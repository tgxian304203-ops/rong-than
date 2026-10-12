// server/boss/vong-lap-sua.js
// Nhiệm vụ: Vòng lặp sửa code cho tới khi Sandbox ĐÚNG.
//
// Hỗ trợ resume: khi user bấm "Sửa tiếp", vòng lặp bắt đầu
// từ code mới nhất trong DB — không làm lại từ đầu.

import { LIMITS } from "../config/limits.js";
import { chonLinhTheoNhiemVu } from "../tieu-nao/chon-linh-theo-nhiem-vu.js";
import { goiLinh } from "../tieu-nao/goi-linh.js";
import { openTask } from "../state/theo-doi-nhiem-vu.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { kiemTraSandbox } from "./kiem-tra-sandbox.js";
import { vietFormatSua } from "./viet-format-sua.js";

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.bossSessionId
 * @param {string} p.language
 * @param {string} p.initialCode       — code bắt đầu vòng lặp
 * @param {string} [p.testCode]
 * @param {string} [p.goal]            — mục tiêu gốc (yêu cầu user)
 * @param {number} [p.maxAttempts]     — số vòng tối đa (mặc định lấy LIMITS)
 * @param {AbortSignal} [p.signal]
 */
export async function vongLapSua({
  userId,
  conversationId,
  bossSessionId,
  language = "javascript",
  initialCode,
  testCode = "",
  goal = "",
  maxAttempts = null,
  signal,
}) {
  let code = initialCode;
  let attempts = 0;
  let lastRun = null;

  const maxIter = Number.isFinite(maxAttempts)
    ? maxAttempts
    : LIMITS.SANDBOX_MAX_FIX_ITERATIONS;

  await logInfo("BOSS: bắt đầu vòng lặp sửa code", {
    userId,
    conversationId,
    language,
    maxAttempts: maxIter,
  });

  while (attempts < maxIter) {
    attempts += 1;

    await logInfo(`BOSS: vòng lặp sửa — lần thử ${attempts}/${maxIter}`, {
      userId,
      conversationId,
    });

    const check = await kiemTraSandbox({
      userId,
      conversationId,
      language,
      code,
      testCode,
      signal,
    });
    lastRun = check;

    if (check.ok) {
      await logInfo("BOSS: vòng lặp sửa — PASS", {
        userId,
        conversationId,
        attempts,
        version: check.version,
      });
      return {
        ok: true,
        finalCode: code,
        version: check.version,
        attempts,
        lastRun: check,
        exhausted: false,
      };
    }

    if (attempts >= maxIter) {
      await logWarn("BOSS: vòng lặp sửa — hết lượt (cần sửa tiếp)", {
        userId,
        conversationId,
        attempts,
      });
      return {
        ok: false,
        finalCode: code,
        version: check.version,
        attempts,
        lastRun: check,
        exhausted: true,
        error: `Đã hết ${maxIter} lần sửa trong lượt này — cần bấm "Sửa tiếp".`,
      };
    }

    const fixFormat = await vietFormatSua({
      userId,
      conversationId,
      goal,
      failedCode: code,
      stdout: check.stdout,
      stderr: check.stderr,
      attempt: attempts,
      language,
    });
    if (!fixFormat.ok) {
      return {
        ok: false,
        finalCode: code,
        attempts,
        lastRun: check,
        exhausted: false,
        error: fixFormat.error || "Không viết được format sửa",
      };
    }

    const pick = await chonLinhTheoNhiemVu({
      userId,
      taskType: "fix-code",
    });
    if (!pick.ok) {
      return {
        ok: false,
        finalCode: code,
        attempts,
        lastRun: check,
        exhausted: false,
        error: pick.error || "Không chọn được lính sửa",
      };
    }

    const task = await openTask({
      userId,
      conversationId,
      bossSessionId,
      taskType: "fix-code",
      payload: fixFormat.format,
    });

    await logInfo("BOSS: gọi lính sửa code", {
      userId,
      conversationId,
      attempt: attempts,
      soldier: pick.soldier.name,
    });

    const fixed = await goiLinh({
      userId,
      taskId: String(task._id),
      soldier: pick.soldier,
      messages: buildFixMessages(fixFormat.format),
      payload: fixFormat.format,
      temperature: 0.3,
      maxTokens: 4096,
      signal,
    });

    if (!fixed.ok || !fixed.text) {
      await logWarn("BOSS: lính sửa thất bại — thử lại", {
        attempt: attempts,
        error: fixed.error,
      });
      continue;
    }

    code = extractCode(fixed.text, language) || fixed.text;
  }

  return {
    ok: false,
    finalCode: code,
    attempts,
    lastRun,
    exhausted: true,
    error: "Vòng lặp sửa vượt quá giới hạn",
  };
}

function buildFixMessages(format) {
  const lines = [
    "Bạn là lính sửa code. Nhiệm vụ: sửa code để vượt qua kiểm thử.",
    "",
    "Mục tiêu:",
    format.goal,
    "",
    "Ngôn ngữ:",
    String(
      format.constraints?.find((c) => c.startsWith("Ngôn ngữ")) || "javascript"
    ),
    "",
    "Code hiện tại:",
    "```",
    format.input,
    "```",
  ];

  if (format.context?.stderr) {
    lines.push("", "Lỗi (stderr):", "```", format.context.stderr, "```");
  }
  if (format.context?.hint) {
    lines.push("", "Gợi ý:", format.context.hint);
  }

  lines.push(
    "",
    "Trả về CHỈ code đã sửa, không thêm giải thích.",
    "Đặt trong khối ``` để dễ tách."
  );

  return [
    {
      role: "system",
      content: "Bạn là lính sửa code. Chỉ trả về code trong ```...```.",
    },
    { role: "user", content: lines.join("\n") },
  ];
}

function extractCode(text, language = "") {
  if (typeof text !== "string") return "";

  const re = /```([a-zA-Z0-9+\-#.]*)\n([\s\S]*?)```/g;
  let match;
  let best = "";
  while ((match = re.exec(text)) !== null) {
    const lang = (match[1] || "").toLowerCase();
    const body = match[2] || "";
    if (language && lang && lang.includes(language)) {
      best = body;
      break;
    }
    if (!best) best = body;
  }
  return best.trim();
}

export default { vongLapSua };