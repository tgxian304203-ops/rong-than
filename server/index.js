// server/index.js
// Nhiệm vụ: Khởi động server Express của Rồng Thần.
// - Đọc biến môi trường
// - Kết nối MongoDB (gán global.__rongThanDB__)
// - Tạo index cho các collection
// - Cấu hình CORS, JSON, upload
// - Mount 7 route: auth, chat, projects, keys, models, sandbox, logs
// - Lắng nghe port

import express from "express";
import cors from "cors";
import multer from "multer";
import { MongoClient } from "mongodb";

import { env, validateEnv, getCorsOrigins } from "./config/env.js";
import { LIMITS } from "./config/limits.js";
import { ghiLog } from "./logs/ghi-log.js";

// Routes
import authRouter from "./routes/auth.js";
import chatRouter from "./routes/chat.js";
import projectsRouter from "./routes/projects.js";
import keysRouter from "./routes/keys.js";
import modelsRouter from "./routes/models.js";
import sandboxRouter from "./routes/sandbox.js";
import logsRouter from "./routes/logs.js";

// ============================================================
// KHỞI ĐỘNG
// ============================================================

async function main() {
  // 1. Kiểm tra biến môi trường bắt buộc
  validateEnv();

  // 2. Kết nối MongoDB
  const client = new MongoClient(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  await db.command({ ping: 1 });

  // 3. Gán vào global để các file db/*.js dùng
  global.__rongThanDB__ = db;
  global.__rongThanClient__ = client;

  // 4. Tạo index cho các collection
  await ensureIndexes(db);

  await ghiLog("info", `Đã kết nối MongoDB: ${env.MONGODB_DB_NAME}`);

  // 5. Khởi tạo Express app
  const app = express();

  // ============================================================
  // MIDDLEWARE
  // ============================================================

  // CORS
  app.use(
    cors({
      origin: (origin, cb) => {
        const allowed = getCorsOrigins();
        // Cho phép request không có origin (mobile, curl)
        if (!origin) return cb(null, true);
        if (allowed.includes(origin)) return cb(null, true);
        // Khi dev, cho phép mọi origin
        if (env.NODE_ENV !== "production") return cb(null, true);
        return cb(new Error(`CORS bị chặn: ${origin}`));
      },
      credentials: true,
    })
  );

  // JSON body
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  // Upload (multer) — dùng cho tệp đính kèm chat
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: LIMITS.MAX_UPLOAD_BYTES },
  });
  app.locals.upload = upload;

  // Request logger nhẹ
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/")) {
      ghiLog("debug", `HTTP ${req.method} ${req.path}`);
    }
    next();
  });

  // ============================================================
  // ROUTES
  // ============================================================

  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/keys", keysRouter);
  app.use("/api/models", modelsRouter);
  app.use("/api/sandbox", sandboxRouter);
  app.use("/api/logs", logsRouter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "rong-than", time: new Date().toISOString() });
  });

  // 404 cho API
  app.use("/api", (_req, res) => {
    res.status(404).json({ ok: false, message: "Không tìm thấy API" });
  });

  // Error handler
  app.use((err, _req, res, _next) => {
    ghiLog("error", `Lỗi Express: ${err?.message || String(err)}`);
    if (res.headersSent) return;
    res.status(500).json({
      ok: false,
      message: err?.message || "Lỗi server",
    });
  });

  // ============================================================
  // LẮNG NGHE
  // ============================================================

  const port = env.PORT || 3000;
  const server = app.listen(port, () => {
    ghiLog("info", `Rồng Thần backend chạy ở port ${port}`);
  });

  // ============================================================
  // TẮT MỀM
  // ============================================================

  async function shutdown(signal) {
    await ghiLog("info", `Nhận ${signal}, đang tắt server...`);
    server.close(async () => {
      try {
        await client.close();
      } catch {
        /* bỏ qua */
      }
      process.exit(0);
    });

    // Buộc thoát sau 10s
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// ============================================================
// TẠO INDEX
// ============================================================

async function ensureIndexes(db) {
  // users
  await db.collection("users").createIndex({ userId: 1 }, { unique: true });

  // projects
  await db
    .collection("projects")
    .createIndex({ userId: 1, createdAt: -1 });

  // conversations
  await db
    .collection("conversations")
    .createIndex({ userId: 1, updatedAt: -1 });
  await db.collection("conversations").createIndex({ projectId: 1 });

  // messages
  await db
    .collection("messages")
    .createIndex({ conversationId: 1, createdAt: 1 });

  // keys
  for (const c of ["daiNaoKeys", "tieuNaoKeys", "webKeys"]) {
    await db.collection(c).createIndex({ userId: 1, provider: 1 });
  }

  // models
  for (const c of ["daiNaoModels", "tieuNaoModels"]) {
    await db.collection(c).createIndex({ tier: 1, taskType: 1 });
  }

  // work states
  await db
    .collection("workStates")
    .createIndex({ userId: 1, conversationId: 1 });

  // tasks
  await db
    .collection("tasks")
    .createIndex({ userId: 1, createdAt: -1 });

  // logs
  await db.collection("systemLogs").createIndex({ timestamp: -1 });
  await db.collection("systemLogs").createIndex({ level: 1 });
}

// ============================================================
// CHẠY
// ============================================================

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[Rồng Thần][FATAL] Không khởi động được server:");
  // eslint-disable-next-line no-console
  console.error(err?.stack || err);
  process.exit(1);
});