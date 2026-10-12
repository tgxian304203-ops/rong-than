// scripts/seedTestData.js
// Nhiệm vụ: Tạo dữ liệu mẫu cho môi trường DEV.
//
// QUY TẮC DỰ ÁN:
//   "Không được phép giả lập trong cả dự án."
//
// → File này CHỈ dùng cho môi trường DEV để test.
// → KHÔNG tự động chạy khi khởi động server.
// → KHÔNG dùng trong production.
// → Mọi dữ liệu mẫu đều có nhãn rõ "__seed": true.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("[seedTestData] KHÔNG chạy seed trong production.");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "rong_than";

  if (!uri) {
    console.error("[seedTestData] Thiếu MONGODB_URI trong .env");
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);

  const now = new Date();

  // Xóa dữ liệu seed cũ (chỉ xóa cái có __seed)
  for (const col of ["users", "projects", "conversations"]) {
    await db.collection(col).deleteMany({ __seed: true });
  }

  // Tạo user test
  await db.collection("users").insertOne({
    __seed: true,
    userId: "seed_user",
    password: "seed123",
    createdAt: now,
    updatedAt: now,
  });

  // Tạo dự án test
  await db.collection("projects").insertOne({
    __seed: true,
    userId: "seed_user",
    name: "Dự án seed",
    description: "Dữ liệu mẫu cho môi trường DEV",
    createdAt: now,
    updatedAt: now,
  });

  await client.close();

  console.log("[seedTestData] Đã tạo dữ liệu mẫu (có __seed: true).");
  console.log("  - user:  seed_user / seed123");
  console.log("  - project: Dự án seed");
}

main().catch((err) => {
  console.error("[seedTestData] Lỗi:", err);
  process.exit(1);
});