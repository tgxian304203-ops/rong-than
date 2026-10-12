// vite.config.js
// Nhiệm vụ: Cấu hình Vite cho React + proxy API sang backend.
// - Port dev: 5173
// - Proxy /api → http://localhost:3000 (backend Express)
// - Cho phép truy cập từ điện thoại trong cùng mạng LAN
//   (host: true — dùng khi test trên Android / iPhone thật)
// - Không tự ý đổi base nếu chưa có yêu cầu.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: true, // cho phép truy cập qua IP LAN khi test mobile
    strictPort: false,
    proxy: {
      // Mọi request /api/* sẽ được chuyển sang backend Express
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 4173,
    host: true,
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 1200,
  },
});