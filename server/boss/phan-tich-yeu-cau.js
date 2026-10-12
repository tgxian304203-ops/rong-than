// server/boss/phan-tich-yeu-cau.js
// Nhiệm vụ: BOSS phân tích yêu cầu User.
//
// QUY TẮC PHÂN LOẠI:
//   - "tạo" → code, "viết" → bulk.
//   - Nếu là "làm lại" → KẾ THỪA taskType từ tin AI gần nhất.

import { moveToStep, WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo } from "../logs/ghi-log.js";

// ============================================================
// TỪ KHÓA "LÀM LẠI"
// ============================================================

const RE_DO_KEYWORDS =
  /\b(làm lại|sửa lại|thử lại|chưa đủ|chưa đúng|dài hơn|ngắn hơn|khác đi|đổi lại|viết lại|thêm|bớt|tiếp tục)\b/i;

export async function phanTichYeuCau({
  userId,
  conversationId,
  userRequest,
  userLabel = null,
  history = [],
}) {
  const req = String(userRequest || "").trim();
  if (!req) return { ok: false, analysis: null, error: "Yêu cầu rỗng" };

  // ============================================================
  // KIỂM TRA "LÀM LẠI"
  // ============================================================
  const isRedo = RE_DO_KEYWORDS.test(req);
  const inheritedTaskType = isRedo ? findLastTaskType(history) : null;

  const analysis = {
    needWeb: userLabel === "need_web" || detectNeedWeb(req),
    needCode: userLabel === "need_code" || detectNeedCode(req),
    estimatedTaskType: inheritedTaskType || guessTaskType(req),
    isRedo,
    inheritedTaskType,
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
// TÌM TASKTYPE TỪ TIN AI GẦN NHẤT
// ============================================================

function findLastTaskType(history) {
  if (!Array.isArray(history) || history.length === 0) return null;

  // Duyệt ngược — tìm tin AI gần nhất có meta.analysis.estimatedTaskType
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "ai" && m.meta?.analysis?.estimatedTaskType) {
      return m.meta.analysis.estimatedTaskType;
    }
  }
  return null;
}

// ============================================================
// PHÁT HIỆN NHU CẦU
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

function detectNeedCode(req) {
  const k = req.toLowerCase();
  return /\btạo\b/.test(k);
}

// ============================================================
// ĐOÁN LOẠI NHIỆM VỤ
// ============================================================

function guessTaskType(req) {
  const k = req.toLowerCase();

  if (/\btạo\b/.test(k)) return "code";
  if (/\bviết\b/.test(k)) return "bulk";

  if (/\b(sửa|fix|debug)\b/.test(k)) return "fix";

  if (
    /\b(code|lập trình|function|script|javascript|typescript|python|react|node|html|css|sql|api)\b/.test(
      k
    )
  ) {
    return "code";
  }

  if (/\b(tóm tắt|summary|tổng hợp)\b/.test(k)) return "summary";

  if (
    /\b(đọc|tài liệu|document|sách|báo cáo)\b/.test(k) &&
    k.length > 200
  ) {
    return "read-long-doc";
  }

  if (/\b(tra|tìm|search|research|nghiên cứu)\b/.test(k)) return "research";

  if (/\b(phân tích|analysis|đánh giá)\b/.test(k)) return "analysis";

  return "bulk";
}

export default { phanTichYeuCau };