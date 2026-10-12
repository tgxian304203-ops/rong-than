// server/sandbox/quan-ly-phien-ban.js
// Nhiệm vụ: Quản lý phiên bản code.
// Khi BOSS kiểm Sandbox sai → lính sửa → phiên bản mới.
// Mỗi phiên bản lưu vào codeArtifacts.
// Khi đúng → lưu phiên bản cuối, BOSS trả kết quả cho Rồng Thần.

import {
  saveArtifact,
  getLatest,
  getNextVersion,
  listByConversation,
} from "../db/codeArtifacts.js";

// ============================================================
// LƯU PHIÊN BẢN MỚI
// ============================================================

/**
 * Lưu code thành 1 phiên bản mới.
 * @returns {Promise<{version: number, artifact: object}>}
 */
export async function saveVersion({
  userId,
  conversationId,
  language,
  code,
  taskId = null,
}) {
  const version = await getNextVersion(conversationId, language);
  const artifact = await saveArtifact({
    userId,
    conversationId,
    language,
    code,
    version,
    taskId,
  });
  return { version, artifact };
}

// ============================================================
// ĐỌC PHIÊN BẢN
// ============================================================

export async function getLatestVersion(conversationId, language) {
  return getLatest(conversationId, language);
}

export async function listVersions(conversationId) {
  return listByConversation(conversationId);
}

// ============================================================
// ĐẾM
// ============================================================

export async function countVersions(conversationId) {
  const items = await listByConversation(conversationId);
  return items.length;
}

export default {
  saveVersion,
  getLatestVersion,
  listVersions,
  countVersions,
};