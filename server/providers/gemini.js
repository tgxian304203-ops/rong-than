function mapMessages(messages) {
  let systemInstruction = "";
  const contents = [];

  for (const m of messages || []) {
    const role = m?.role;
    const content = String(m?.content ?? "");
    if (!content) continue;

    if (role === "system") {
      systemInstruction += (systemInstruction ? "\n\n" : "") + content;
      continue;
    }

    const mappedRole = role === "assistant" ? "model" : "user";

    // Nếu role hiện tại trùng với role của tin nhắn ngay trước đó -> Gộp nội dung lại
    const lastContent = contents[contents.length - 1];
    if (lastContent && lastContent.role === mappedRole) {
      lastContent.parts[0].text += "\n\n" + content;
    } else {
      // Nếu khác role -> Thêm mới
      contents.push({
        role: mappedRole,
        parts: [{ text: content }],
      });
    }
  }

  // Gemini bắt buộc mảng contents phải bắt đầu bằng role 'user'
  // Nếu tin nhắn đầu tiên là 'model' (do history cắt sai), ta phải xóa nó đi
  if (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }

  return { contents, systemInstruction };
}