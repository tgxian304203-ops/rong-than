// server/db/projectFiles.js
// Nhiệm vụ: Quản lý từng file riêng biệt trong dự án (Tránh giới hạn 16MB của MongoDB)
// SỬ DỤNG NATIVE MONGODB DRIVER (Đồng bộ với codeArtifacts.js)

const COL_NAME = "projectFiles";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

// Lấy tất cả file của 1 dự án (Trả về dạng object { "index.html": "..." } để tương thích với chat.js)
export async function getAllFiles({ conversationId }) {
  const files = await col()
    .find({ conversationId: String(conversationId) })
    .toArray();
    
  const result = {};
  for (const f of files) {
    result[f.filename] = f.content;
  }
  return result;
}

// Lưu hoặc cập nhật 1 file
export async function upsertFile({ userId, conversationId, filename, content, language }) {
  const now = new Date();
  
  await col().updateOne(
    { 
      conversationId: String(conversationId), 
      filename: String(filename) 
    },
    { 
      $set: { 
        userId: String(userId), 
        content: String(content || ""), 
        language: String(language || "html"), 
        updatedAt: now 
      } 
    },
    { upsert: true } // Nếu chưa có thì tạo mới, có rồi thì cập nhật
  );
}

// Xóa 1 file
export async function deleteFile({ conversationId, filename }) {
  await col().deleteOne({ 
    conversationId: String(conversationId), 
    filename: String(filename) 
  });
}

// Xóa toàn bộ file của dự án
export async function deleteAllFiles({ conversationId }) {
  await col().deleteMany({ conversationId: String(conversationId) });
}

export default { getAllFiles, upsertFile, deleteFile, deleteAllFiles };