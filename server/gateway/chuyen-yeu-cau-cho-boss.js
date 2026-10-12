// server/gateway/chuyen-yeu-cau-cho-boss.js
// Nhiệm vụ: Rồng Thần chuyển yêu cầu cho BOSS.
// Quy tắc dự án (PHẦN 02, luồng 1-3):
//   - RỒNG THẦN chuyển yêu cầu cho BOSS.

import { acquireLock, releaseLock } from "../state/tranh-xung-dot.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// CHUYỂN
// ============================================================

/**
 * Khóa hội thoại lại (1 BOSS tại 1 thời điểm), rồi giao việc
 * cho hàm xử lý BOSS. Hàm xử lý do nơi gọi truyền vào.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {string} p.userRequest
 * @param {string} [p.userLabel]
 * @param {(args: object) => Promise<any>} p.runBoss
 * @param {AbortSignal} [p.signal]
 */
export async function chuyenYeuCauChoBoss({
  userId,
  conversationId,
  userRequest,
  userLabel = null,
  runBoss,
  signal,
}) {
  if (typeof runBoss !== "function") {
    return { ok: false, error: "Thiếu hàm runBoss để chạy BOSS" };
  }

  // Khóa hội thoại để tránh 2 BOSS cùng ghi
  const owner = `gateway:${userId}:${Date.now()}`;
  const locked = acquireLock(conversationId, owner);

  if (!locked) {
    await logWarn("Rồng Thần: hội thoại đang bị BOSS khác giữ", {
      userId,
      conversationId,
    });
    return {
      ok: false,
      error: "Hội thoại đang được xử lý, vui lòng đợi.",
    };
  }

  try {
    await logInfo("Rồng Thần chuyển yêu cầu cho BOSS", {
      userId,
      conversationId,
      userLabel,
    });

    const result = await runBoss({
      userId,
      conversationId,
      userRequest,
      userLabel,
      signal,
    });

    return result || { ok: false, error: "BOSS không trả về kết quả" };
  } catch (err) {
    await logWarn("Rồng Thần: BOSS lỗi khi xử lý", {
      userId,
      conversationId,
      error: err?.message || String(err),
    });
    return { ok: false, error: err?.message || "BOSS gặp lỗi" };
  } finally {
    releaseLock(conversationId, owner);
  }
}

export default { chuyenYeuCauChoBoss };