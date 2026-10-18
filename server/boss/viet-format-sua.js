// server/boss/viet-format-sua.js
// Nhiệm vụ: BOSS viết format sửa khi Sandbox báo lỗi.

export async function vietFormatSua({
  userId, conversationId, goal, failedCode, stdout, stderr, attempt = 1, language = "javascript", failures = null,
}) {
  if (!failedCode && (!failures || failures.length === 0)) return { ok: false, format: null, error: "Thiếu dữ liệu để sửa" };

  const errLower = String(stderr || "").toLowerCase();
  const isShellError = errLower.includes("shell") || errLower.includes("git command");
  const isEmptyError = errLower.includes("code rỗng");
  const isInvalidHtml = errLower.includes("html không có đủ thẻ");

  let specialHint = "";
  if (isShellError) specialHint = "🚨 LỖI: Bạn đã trả về SHELL/GIT COMMANDS. Hãy trả về CODE CHẠY ĐƯỢC.";
  else if (isEmptyError) specialHint = "🚨 LỖI: Code rỗng. Hãy trả về code đầy đủ.";
  else if (isInvalidHtml) specialHint = "🚨 LỖI: HTML không đầy đủ. Hãy trả về HTML với đầy đủ thẻ <!DOCTYPE html>, <html>, <head>, <body>.";

  let failuresDesc = "";
  if (Array.isArray(failures) && failures.length > 0) {
    failuresDesc = failures.map((f, i) => `Lính #${i + 1} (${f.soldier}): ${f.error} ${f.partialOutput ? ` — Output dở: ${f.partialOutput.slice(0, 200)}...` : ""}`).join("\n");
  }

  const hint = specialHint || buildHintFromError(stderr, stdout);

  const format = {
    taskType: "fix-code",
    goal: `CHỈ ĐỊNH SỬA:
- Vị trí: [Cần điền hàm/dòng bị lỗi]
- Vấn đề: [Giải thích tại sao sai]
- Cách sửa: [Hướng dẫn sửa cụ thể]

Mục tiêu gốc: ${goal || "(không rõ)"}

${specialHint}

QUY TẮC BẮT BUỘC CHO LÍNH:
- CHỈ SỬA ĐÚNG VỊ TRÍ TRÊN.
- BẮT BUỘC TRẢ VỀ TOÀN BỘ CODE ĐÃ SỬA (Không cắt bớt).
- KHÔNG dùng shell commands.`,
    input: failedCode || "",
    constraints: [
      `Ngôn ngữ: HTML/JS/Python`, 
      "BẮT BUỘC trả về toàn bộ code", 
      "CHỈ sửa chỗ lỗi", 
      "KHÔNG dùng shell commands"
    ],
    expectedOutput: "Toàn bộ code hoàn chỉnh, đã sửa đúng vị trí lỗi, các phần khác giữ nguyên.",
    context: { attempt, stdout: stdout || "", stderr: stderr || "", hint, failuresDesc, previousFailures: failures || [], isWrongType: isShellError || isInvalidHtml || isEmptyError, wrongTypeReason: specialHint },
  };

  return { ok: true, format };
}

function buildHintFromError(stderr, stdout) {
  const s = String(stderr || "") + "\n" + String(stdout || "");
  const lower = s.toLowerCase();
  if (!s.trim()) return "Không có thông báo lỗi cụ thể.";
  if (lower.includes("syntaxerror")) return "Lỗi cú pháp — kiểm tra dấu ngoặc, dấu phẩy.";
  if (lower.includes("typeerror")) return "Lỗi kiểu — kiểm tra biến undefined / null.";
  if (lower.includes("referenceerror")) return "Tham chiếu sai — kiểm tra tên biến/hàm.";
  if (lower.includes("modulenotfound")) return "Thiếu module — kiểm tra import.";
  if (lower.includes("timeout")) return "Chạy quá lâu — kiểm tra vòng lặp vô hạn.";
  if (lower.includes("shell") || lower.includes("git command")) return "🚨 Lính trả về shell/git — cần trả về CODE thật.";
  return "Đọc kỹ stderr để tìm nguyên nhân.";
}

export default { vietFormatSua };