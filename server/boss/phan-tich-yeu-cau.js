// server/boss/phan-tich-yeu-cau.js
// Nhiệm vụ: BOSS phân tích yêu cầu User.
//
// QUY TẮC PHÂN LOẠI (theo yêu cầu dự án):
//   - Câu có từ "tạo"  → taskType = "code"
//   - Câu có từ "viết" → taskType = "bulk" (văn bản)
//   - Ưu tiên "tạo" nếu có cả 2 từ
//   - Không áp dụng ngữ cảnh — chỉ quan tâm động từ.

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

// ============================================================
// PHÁT HIỆN NHU CẦU WEB
// ============================================================

function detectNeedWeb(req) {
  const k = req.toLowerCase();
  const keywords = [
    "mới nhất", "hôm nay", "hiện tại", "tin tức", "tra cứu",
    "tìm kiếm", "google", "web", "url", "http", "link",
    "nguồn", "số liệu", "thống kê", "giá", "tỷ giá", "thời tiết",
  ];
  return keywords.some((w) => k.includes(w));
}

// ============================================================
// PHÁT HIỆN NHU CẦU CODE
// ============================================================
// Quy tắc: có từ "tạo" → cần code. Có từ "viết" → không cần code.

function detectNeedCode(req) {
  const k = req.toLowerCase();
  return /\btạo\b/.test(k);
}

// ============================================================
// ĐOÁN LOẠI NHIỆM VỤ
// ============================================================
// Quy tắc cứng:
//   - Có "tạo"  → "code" (ưu tiên cao nhất)
//   - Có "viết" → "bulk" (văn bản)
//   - Còn lại → đoán theo từ khóa khác

function guessTaskType(req) {
  const k = req.toLowerCase();

  // ===== ƯU TIÊN 1: Có "tạo" → code =====
  if (/\btạo\b/.test(k)) {
    return "code";
  }

  // ===== ƯU TIÊN 2: Có "viết" → bulk (văn bản) =====
  if (/\bviết\b/.test(k)) {
    return "bulk";
  }

  // ===== Các trường hợp khác — đoán theo từ khóa =====

  // FIX (sửa lỗi)
  if (/\b(sửa|fix|debug)\b/.test(k)) {
    return "fix";
  }

  // CODE (có từ khóa code cụ thể)
  if (
    /\b(code|lập trình|function|script|javascript|typescript|python|react|node|html|css|sql|api)\b/.test(
      k
    )
  ) {
    return "code";
  }

  // TÓM TẮT
  if (/\b(tóm tắt|summary|tổng hợp)\b/.test(k)) {
    return "summary";
  }

  // ĐỌC TÀI LIỆU DÀI
  if (
    /\b(đọc|tài liệu|document|sách|báo cáo)\b/.test(k) &&
    k.length > 200
  ) {
    return "read-long-doc";
  }

  // TRA CỨU
  if (/\b(tra|tìm|search|research|nghiên cứu)\b/.test(k)) {
    return "research";
  }

  // PHÂN TÍCH
  if (/\b(phân tích|analysis|đánh giá)\b/.test(k)) {
    return "analysis";
  }

  // Mặc định — tác vụ văn bản thường
  return "bulk";
}

export default { phanTichYeuCau };