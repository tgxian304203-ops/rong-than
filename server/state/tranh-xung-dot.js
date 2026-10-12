// server/state/tranh-xung-dot.js
// Nhiệm vụ: Tránh 2 BOSS cùng ghi vào 1 hội thoại.
// Khi BOSS cũ hết quota → gọi BOSS mới. Trong lúc chuyển giao,
// phải đảm bảo chỉ 1 BOSS được ghi ở 1 thời điểm.

// ============================================================
// KHÓA TRONG BỘ NHỚ (in-memory lock)
// ============================================================
// Vì backend chạy 1 process (không cluster), dùng Map là đủ.
// Nếu sau này scale nhiều process → chuyển sang lock trong MongoDB.

const LOCKS = new Map(); // conversationId → { owner, lockedAt }

const LOCK_TTL_MS = 60 * 1000; // khóa hết hạn sau 60 giây

// ============================================================
// KHÓA
// ============================================================

/**
 * Cố gắng khóa 1 hội thoại cho 1 BOSS.
 * @returns {boolean} true nếu khóa thành công
 */
export function acquireLock(conversationId, owner) {
  const key = String(conversationId);
  const now = Date.now();

  const existing = LOCKS.get(key);
  if (existing && now - existing.lockedAt < LOCK_TTL_MS) {
    // Đang bị khóa bởi người khác
    if (existing.owner !== owner) return false;
    // Chính chủ đang giữ → gia hạn
    existing.lockedAt = now;
    return true;
  }

  LOCKS.set(key, { owner, lockedAt: now });
  return true;
}

// ============================================================
// MỞ KHÓA
// ============================================================

/**
 * Mở khóa, chỉ chủ sở hữu mới mở được.
 */
export function releaseLock(conversationId, owner) {
  const key = String(conversationId);
  const existing = LOCKS.get(key);
  if (!existing) return false;
  if (existing.owner !== owner) return false;
  LOCKS.delete(key);
  return true;
}

// ============================================================
// KIỂM TRA
// ============================================================

export function isLocked(conversationId) {
  const key = String(conversationId);
  const existing = LOCKS.get(key);
  if (!existing) return false;
  if (Date.now() - existing.lockedAt >= LOCK_TTL_MS) {
    LOCKS.delete(key);
    return false;
  }
  return true;
}

export function getLockOwner(conversationId) {
  const key = String(conversationId);
  const existing = LOCKS.get(key);
  if (!existing) return null;
  if (Date.now() - existing.lockedAt >= LOCK_TTL_MS) {
    LOCKS.delete(key);
    return null;
  }
  return existing.owner;
}

// ============================================================
// DỌN ĐỊNH KỲ
// ============================================================

export function cleanupExpired() {
  const now = Date.now();
  for (const [k, v] of LOCKS.entries()) {
    if (now - v.lockedAt >= LOCK_TTL_MS) LOCKS.delete(k);
  }
}

// Chạy dọn mỗi 60 giây
setInterval(cleanupExpired, LOCK_TTL_MS).unref?.();

export default {
  acquireLock,
  releaseLock,
  isLocked,
  getLockOwner,
  cleanupExpired,
};