// server/boss/danh-gia-ket-qua.js
// Nhiệm vụ: BOSS đánh giá kết quả lính trả về.
// Quy tắc dự án (PHẦN 02, luồng 3):
//   - Nếu nhiệm vụ liên quan code → BOSS kiểm tra chạy thử Sandbox.
//   - Đúng → trả về Rồng Thần.
//   - Sai → viết format cho lính sửa.

// ============================================================
// ĐÁNH GIÁ
// ============================================================

/**
 * @param {object} p
 * @param {object} p.analysis     - từ phan-tich-yeu-cau
 * @param {string} [p.mergedText] - kết quả gộp từ lính
 * @returns {Promise<{ok: boolean, needSandbox: boolean, needWeb: boolean, reason: string}>}
 */
export async function danhGiaKetQua({ analysis, mergedText }) {
  const needCode = !!analysis?.needCode;
  const needWeb = !!analysis?.needWeb;

  // Nếu là code → bắt buộc kiểm Sandbox
  if (needCode) {
    return {
      ok: true,
      needSandbox: true,
      needWeb: false,
      reason: "Nhiệm vụ liên quan code → phải kiểm Sandbox",
    };
  }

  // Nếu không phải code → chỉ cần có nội dung trả về
  const hasContent = typeof mergedText === "string" && mergedText.trim().length > 0;
  if (!hasContent) {
    return {
      ok: false,
      needSandbox: false,
      needWeb: false,
      reason: "Lính không trả về nội dung nào",
    };
  }

  return {
    ok: true,
    needSandbox: false,
    needWeb,
    reason: needWeb ? "Nhiệm vụ cần web — kiểm tra ngữ cảnh" : "Không cần Sandbox",
  };
}

export default { danhGiaKetQua };