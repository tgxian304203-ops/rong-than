// server/dai-nao/goi-boss-moi.js
// Nhiệm vụ: Khi BOSS cũ hết quota hoặc lỗi, Đại Não gọi BOSS mới lên thay.

import { markReplaced } from "../db/bossSessions.js";
import { loadWorkState } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { chonBossTheoYeuCau } from "./chon-boss-theo-yeu-cau.js";
import { goiBoss } from "./goi-boss.js";

export async function goiBossMoi({
  userId,
  conversationId,
  oldSession,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
}) {
  await logInfo("Đại Não: gọi BOSS mới thay BOSS cũ", {
    userId,
    conversationId,
  });

  const workState = await loadWorkState(userId, conversationId);
  const handoff = {
    userRequest: workState?.userRequest || null,
    currentStep: workState?.currentStep || null,
    status: workState?.status || null,
    context: workState?.context || {},
  };

  if (oldSession && oldSession._id) {
    try {
      await markReplaced(String(oldSession._id));
    } catch {
      /* bỏ qua */
    }
  }

  const picked = await chonBossTheoYeuCau({ userId });
  if (!picked.ok) {
    await logWarn("Đại Não: không có BOSS mới khả dụng", {
      userId,
      conversationId,
    });
    return {
      ok: false,
      handoff,
      error: picked.error || "Không có BOSS mới khả dụng",
    };
  }

  const handoffMessage = buildHandoffMessage(handoff);
  const messagesWithHandoff = handoffMessage
    ? [...messages, { role: "system", content: handoffMessage }]
    : messages;

  await logInfo("Đại Não: BOSS mới đang xử lý", {
    userId,
    conversationId,
    boss: picked.boss.name,
  });

  const res = await goiBoss({
    userId,
    conversationId,
    boss: picked.boss,
    messages: messagesWithHandoff,
    temperature,
    maxTokens,
    signal,
  });

  if (res.ok) {
    await logInfo("Đại Não: BOSS mới hoàn thành", {
      userId,
      conversationId,
      boss: picked.boss.name,
    });
  } else {
    await logWarn("Đại Não: BOSS mới cũng thất bại", {
      userId,
      conversationId,
      boss: picked.boss.name,
      error: res.error,
    });
  }

  return {
    ok: res.ok,
    text: res.text,
    session: res.session,
    boss: picked.boss,
    handoff,
    error: res.error,
  };
}

function buildHandoffMessage(handoff) {
  if (!handoff || !handoff.userRequest) return null;

  const lines = [
    "[BÀN GIAO BOSS MỚI]",
    "BOSS cũ đã hết quota hoặc lỗi. Bạn là BOSS mới.",
    "",
    "Yêu cầu gốc của User:",
    `"${handoff.userRequest}"`,
    "",
    `Bước hiện tại: ${handoff.currentStep || "(chưa rõ)"}`,
    `Trạng thái: ${handoff.status || "(chưa rõ)"}`,
  ];

  if (handoff.context && Object.keys(handoff.context).length > 0) {
    lines.push("");
    lines.push("Ngữ cảnh bổ sung:");
    try {
      lines.push(JSON.stringify(handoff.context, null, 2));
    } catch {
      /* bỏ qua */
    }
  }

  lines.push("");
  lines.push("Hãy đọc lại yêu cầu, xác định đang làm gì, đã làm tới đâu,");
  lines.push("và tiếp tục nhiệm vụ cho đúng.");

  return lines.join("\n");
}

export default { goiBossMoi };