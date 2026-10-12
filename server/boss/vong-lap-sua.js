// server/boss/vong-lap-sua.js
// Nhiệm vụ: Vòng lặp sửa code cho tới khi Sandbox ĐÚNG mới thôi.

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
  signal,
}) {
  let code = initialCode;
  let attempts = 0;
  let lastRun = null;

  await logInfo("BOSS: bắt đầu vòng lặp sửa code", {
    userId,
    conversationId,
    language,
    maxAttempts: LIMITS.SANDBOX_MAX_FIX_ITERATIONS,
  });

  while (attempts < LIMITS.SANDBOX_MAX_FIX_ITERATIONS) {
    attempts += 1;

    await logInfo(`BOSS: vòng lặp sửa — lần thử ${attempts}`, {
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
      };
    }

    if (attempts >= LIMITS.SANDBOX_MAX_FIX_ITERATIONS) {
      await logWarn("BOSS: vòng lặp sửa — hết lượt", {
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
        error: "Đã hết số lần sửa tối đa mà vẫn chưa đúng",
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
      await logWarn("BOSS: không viết được format sửa", {
        error: fixFormat.error,
      });
      return {
        ok: false,
        finalCode: code,
        attempts,
        lastRun: check,
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
      await logWarn("BOSS: lính sửa thất bại", {
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
    String(format.constraints?.find((c) => c.startsWith("Ngôn ngữ")) || "javascript"),
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