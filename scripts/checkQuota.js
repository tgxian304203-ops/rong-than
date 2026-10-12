// scripts/checkQuota.js
// Nhiệm vụ: Kiểm tra quota của toàn bộ key trong DB.
// Chạy: node scripts/checkQuota.js
//
// Đọc key từ MongoDB, gọi provider để kiểm tra.
// Cập nhật lại trạng thái quota vào collection *Keys.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// Ghi chú: file này dùng fetch, cần Node >= 18.

const MODEL_ENDPOINTS = {
  groq: (k) => ({
    url: "https://api.groq.com/openai/v1/models",
    headers: { Authorization: `Bearer ${k}` },
  }),
  gemini: (k) => ({
    url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
    headers: {},
  }),
  openrouter: (k) => ({
    url: "https://openrouter.ai/api/v1/models",
    headers: { Authorization: `Bearer ${k}` },
  }),
};

const WEB_ENDPOINTS = {
  tavily: (k) => ({
    url: "https://api.tavily.com/search",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: k, query: "ping", max_results: 1 }),
  }),
  serpjet: (k) => ({
    url: `https://api.serpjet.com/search?q=ping&limit=1&api_key=${encodeURIComponent(k)}`,
    headers: {},
  }),
  brave: (k) => ({
    url: "https://api.search.brave.com/res/v1/web/search?q=ping&count=1",
    headers: { "X-Subscription-Token": k, Accept: "application/json" },
  }),
};

async function checkKey(provider, rawKey, kind) {
  try {
    const cfg =
      kind === "model"
        ? MODEL_ENDPOINTS[provider]?.(rawKey)
        : WEB_ENDPOINTS[provider]?.(rawKey);
    if (!cfg) return { ok: false, error: `Chưa hỗ trợ ${provider}` };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(cfg.url, {
        method: cfg.method || "GET",
        headers: cfg.headers,
        body: cfg.body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "rong_than";

  if (!uri) {
    console.error("[checkQuota] Thiếu MONGODB_URI trong .env");
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);

  const groups = [
    { col: "daiNaoKeys", kind: "model" },
    { col: "tieuNaoKeys", kind: "model" },
    { col: "webKeys", kind: "web" },
  ];

  for (const g of groups) {
    const items = await db.collection(g.col).find({}).toArray();
    console.log(`\n[checkQuota] ${g.col}: ${items.length} key`);

    for (const item of items) {
      const res = await checkKey(item.provider, item.rawKey, g.kind);
      const quota = res.ok ? "ok" : "out";

      await db.collection(g.col).updateOne(
        { _id: item._id },
        {
          $set: {
            quota,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      console.log(
        `  - ${item.provider} ${item.maskedKey}: ${quota}${
          res.ok ? "" : ` (${res.error || "HTTP " + res.status})`
        }`
      );
    }
  }

  await client.close();
  console.log("\n[checkQuota] Xong.");
}

main().catch((err) => {
  console.error("[checkQuota] Lỗi:", err);
  process.exit(1);
});