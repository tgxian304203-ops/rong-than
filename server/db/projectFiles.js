// server/db/projectFiles.js
// Nhiệm vụ: Quản lý từng file riêng biệt trong dự án (Tránh giới hạn 16MB của MongoDB)

import mongoose from "mongoose";

const projectFileSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  conversationId: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  content: { type: String, default: "" },
  language: { type: String, default: "html" },
  updatedAt: { type: Date, default: Date.now }
});

// Đảm bảo trong 1 dự án, tên file là duy nhất
projectFileSchema.index({ conversationId: 1, filename: 1 }, { unique: true });

const ProjectFile = mongoose.models.ProjectFile || mongoose.model("ProjectFile", projectFileSchema);

export async function getAllFiles({ conversationId }) {
  const files = await ProjectFile.find({ conversationId }).lean();
  const result = {};
  for (const f of files) {
    result[f.filename] = f.content;
  }
  return result;
}

export async function upsertFile({ userId, conversationId, filename, content, language }) {
  await ProjectFile.updateOne(
    { conversationId, filename },
    { $set: { userId, content, language, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function deleteFile({ conversationId, filename }) {
  await ProjectFile.deleteOne({ conversationId, filename });
}

export async function deleteAllFiles({ conversationId }) {
  await ProjectFile.deleteMany({ conversationId });
}

export default { getAllFiles, upsertFile, deleteFile, deleteAllFiles };