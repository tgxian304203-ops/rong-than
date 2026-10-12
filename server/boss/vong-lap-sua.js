// server/boss/vong-lap-sua.js
// Nhiệm vụ: Vòng lặp sửa code cho tới khi ĐÚNG.
// Lính mới nhận: prompt gốc + lỗi lính cũ + output dở.

import { LIMITS } from "../config/limits.js";
import { chonLinhTheoNhiemVu } from "../tieu-nao/chon-linh-theo-nhiem-vu.js";
import { goiLinh } from "../tieu-nao/goi-linh.js";
import { openTask } from "../state/theo-doi-nhiem-vu.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { kiemTraSandbox } from "./kiem-tra-sandbox.js";
import { vietFormatSua } from "./viet-format-sua.js";

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
  const failureHistory = [];

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
      failureHistoryCount: failureHistory.length,
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

    // Ghi lỗi vào lịch sử
    failureHistory.push({
      attempt: attempts,
      error: check.stderr || check.error || "Không rõ",
      partialOutput: code.slice(0, 500),
    });

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

    // ============================================================
    // VIẾT FORMAT SỬA — KÈM LỊCH SỬ LỖI
    // ============================================================
    const fixFormat = await vietFormatSua({
      userId,
      conversationId,
      goal,
      failedCode: code,
      stdout: check.stdout,
      stderr: check.stderr,
      attempt: attempts,
      language,
      failures: failureHistory,
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

    await logInfo("BOSS: gọi lính sửa code (có ngữ cảnh)", {
      userId,
      conversationId,
      attempt: attempts,
      soldier: pick.soldier.name,
      hasFailureHistory: failureHistory.length > 0,
    });

    const fixed = await goiLinh({
      userId,
      taskId: String(task._id),
      soldier: pick.soldier,
      candidates: pick.candidates,
      messages: buildFixMessages(fixFormat.format, failureHistory),
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

// ============================================================
// MESSAGES CHO LÍNH SỬA
// ============================================================

function buildFixMessages(format, failureHistory = []) {
  const lines = [
    "Bạn là lính sửa code. Nhiệm vụ: sửa code để vượt qua kiểm thử.",
    "",
    "Mục tiêu gốc:",
    format.goal,
    "",
    "Ngôn ngữ:",
    String(
      format.constraints?.find((c) => c.startsWith("Ngôn ngữ")) || "javascript"
    ),
    "",
    "Code hiện tại:",
    "```",
    format.input || "(chưa có)",
    "```",
  ];

  if (format.context?.stderr) {
    lines.push("", "Lỗi (stderr):", "```", format.context.stderr, "```");
  }
  if (format.context?.hint) {
    lines.push("", "Gợi ý:", format.context.hint);
  }

  // Thêm lịch sử lỗi
  if (failureHistory.length > 1) {
    lines.push("", `[Lịch sử ${failureHistory.length - 1} lần sửa trước]`);
    failureHistory.slice(0, -1).forEach((h) => {
      lines.push(`- Lần ${h.attempt}: ${h.error}`);
    });
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