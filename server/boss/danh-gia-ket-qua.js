// server/boss/danh-gia-ket-qua.js
// Nhiệm vụ: BOSS đánh giá kết quả lính trả về.

export async function danhGiaKetQua({ analysis, mergedText, failures }) {
  const needCode = !!analysis?.needCode;
  const needWeb = !!analysis?.needWeb;

  // Nếu có lỗi lính → báo cần sửa
  if (Array.isArray(failures) && failures.length > 0) {
    return {
      ok: false,
      needSandbox: false,
      needWeb: false,
      needFix: true,
      failures,
      reason: `${failures.length} lính thất bại — cần sửa`,
    };
  }

  // Nếu là code → bắt buộc kiểm Sandbox
  if (needCode) {
    return {
      ok: true,
      needSandbox: true,
      needWeb: false,
      needFix: false,
      reason: "Nhiệm vụ liên quan code → phải kiểm Sandbox",
    };
  }

  const hasContent =
    typeof mergedText === "string" && mergedText.trim().length > 0;
  if (!hasContent) {
    return {
      ok: false,
      needSandbox: false,
      needWeb: false,
      needFix: true,
      reason: "Lính không trả về nội dung nào",
    };
  }

  return {
    ok: true,
    needSandbox: false,
    needWeb,
    needFix: false,
    reason: needWeb ? "Nhiệm vụ cần web — kiểm tra ngữ cảnh" : "Không cần Sandbox",
  };
}

export default { danhGiaKetQua };