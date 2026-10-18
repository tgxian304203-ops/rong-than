// server/dai-nao/goi-boss-moi.js
// Nhiệm vụ: Khi BOSS cũ hết quota hoặc lỗi, Đại Não gọi BOSS mới lên thay.
// Sử dụng file ban-giao-trang-thai.js để lấy TOÀN BỘ ngữ cảnh (code, sandbox, web).

import { markReplaced } from "../db/bossSessions.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";
import { chonBossTheoYeuCau } from "./chon-boss-theo-yeu-cau.js";
import { goiBoss } from "./goi-boss.js";
import { banGiaoTrangThai, buildHandoffPrompt } from "./ban-giao-trang-thai.js";

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

  // ============================================================
  // BƯỚC 1: LẤY DỮ LIỆU BÀN GIAO
  // ============================================================
  const handoffRes = await banGiaoTrangThai({ userId, conversationId });
  const handoff = handoffRes.ok ? handoffRes.handoff : null;

  if (!handoffRes.ok) {
    await logWarn("Đại Não: không lấy được dữ liệu bàn giao", {
      userId,
      conversationId,
      error: handoffRes.error,
    });
  }

  // Đánh dấu BOSS cũ đã bị thay thế
  if (oldSession && oldSession._id) {
    try {
      await markReplaced(String(oldSession._id));
    } catch {
      /* bỏ qua */
    }
  }

  // ============================================================
  // BƯỚC 2: CHỌN BOSS MỚI
  // ============================================================
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

  // ============================================================
  // BƯỚC 3: DỰNG PROMPT BÀN GIAO
  // ============================================================
  const handoffMessage = handoff ? buildHandoffPrompt(handoff) : null;
  
  const messagesWithHandoff = handoffMessage
    ? [...messages, { role: "system", content: handoffMessage }]
    : messages;

  await logInfo("Đại Não: BOSS mới đang xử lý", {
    userId,
    conversationId,
    boss: picked.boss.name,
    hasHandoff: !!handoffMessage,
  });

  // ============================================================
  // BƯỚC 4: GỌI BOSS MỚI
  // ============================================================
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

export default { goiBossMoi };