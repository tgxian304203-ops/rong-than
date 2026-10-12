// scripts/backupData.js
// Nhiệm vụ: Sao lưu dữ liệu từ MongoDB ra file JSON.
// Chạy: node scripts/backupData.js
//
// LƯU Ý:
//   - File này KHÔNG giả lập. Nó đọc thật từ MongoDB.
//   - Phải có MONGODB_URI trong .env ở gốc dự án.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const COLLECTIONS = [
  "users",
  "conversations",
  "messages",
  "projects",
  "daiNaoKeys",
  "tieuNaoKeys",
  "webKeys",
  "daiNaoModels",
  "tieuNaoModels",
  "modelHealth",
  "quotaState",
  "bossSessions",
  "workStates",
  "tasks",
  "subBrainTasks",
  "taskResults",
  "webSearchRuns",
  "codeArtifacts",
  "sandboxRuns",
  "testResults",
  "systemLogs",
  "attachments",
  "settings",
];

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "rong_than";

  if (!uri) {
    console.error("[backupData] Thiếu MONGODB_URI trong .env");
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);

  const backupDir = path.resolve(__dirname, "..", "backup");
  await fs.mkdir(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const result = {};

  for (const name of COLLECTIONS) {
    try {
      const items = await db.collection(name).find({}).toArray();
      result[name] = items;
      console.log(`  ✓ ${name}: ${items.length} bản ghi`);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err?.message || err}`);
      result[name] = [];
    }
  }

  const outFile = path.join(backupDir, `backup-${ts}.json`);
  await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf8");

  await client.close();

  console.log(`\n[backupData] Đã sao lưu vào: ${outFile}`);
}

main().catch((err) => {
  console.error("[backupData] Lỗi:", err);
  process.exit(1);
});