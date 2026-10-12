// server/boss/phan-tich-yeu-cau.js
// Nhiệm vụ: BOSS phân tích yêu cầu User.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

export async function phanTichYeuCau({
  userId,
  conversationId,
  userRequest,
  userLabel = null,
}) {
  const req = String(userRequest || "").trim();
  if (!req) return { ok: false, analysis: null, error: "Yêu cầu rỗng" };

  const analysis = {
    needWeb: userLabel === "need_web" || detectNeedWeb(req),
    needCode: userLabel === "need_code" || detectNeedCode(req),
    estimatedTaskType: guessTaskType(req),
    rawLength: req.length,
  };

  await moveToStep(
    userId,
    conversationId,
    WORK_STEP.CLASSIFIED,
    WORK_STATUS.IN_PROGRESS
  );

  await logInfo("BOSS: phân tích yêu cầu xong", {
    userId,
    conversationId,
    needWeb: analysis.needWeb,
    needCode: analysis.needCode,
    taskType: analysis.estimatedTaskType,
  });

  return { ok: true, analysis };
}

function detectNeedWeb(req) {
  const k = req.toLowerCase();
  const keywords = [
    "mới nhất", "hôm nay", "hiện tại", "tin tức", "tra cứu",
    "tìm kiếm", "google", "web", "url", "http", "link",
    "nguồn", "số liệu", "thống kê", "giá", "tỷ giá", "thời tiết",
  ];
  return keywords.some((w) => k.includes(w));
}

function detectNeedCode(req) {
  const k = req.toLowerCase();
  const keywords = [
    "code", "lập trình", "hàm", "function", "script", "js",
    "javascript", "python", "react", "node", "html", "css",
    "sql", "api", "bug", "lỗi", "sửa", "fix", "viết", "tạo",
  ];
  return keywords.some((w) => k.includes(w));
}

function guessTaskType(req) {
  const k = req.toLowerCase();
  if (/sửa|fix|bug|lỗi/.test(k)) return "fix";
  if (/code|lập trình|hàm|function|script|viết/.test(k)) return "code";
  if (/tóm tắt|summary/.test(k)) return "summary";
  if (/đọc|tài liệu|document/.test(k)) return "read-long-doc";
  if (/tra|tìm|search|research/.test(k)) return "research";
  if (/phân tích|analysis/.test(k)) return "analysis";
  return "bulk";
}

export default { phanTichYeuCau };