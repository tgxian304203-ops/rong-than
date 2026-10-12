// vite.config.js
// Nhiệm vụ: Cấu hình Vite cho React + proxy API sang backend.
// - Cho phép JSX trong file .js (theo sơ đồ dự án)
// - Proxy /api → http://localhost:3000 (backend Express khi dev)
// - Cho phép truy cập từ điện thoại trong LAN
// - Không tự ý đổi base nếu chưa có yêu cầu.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Cho phép JSX trong file .js (Vite mặc định chỉ chấp nhận JSX trong .jsx)
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.js$/,
    exclude: [],
  },

  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },

  server: {
    port: 5173,
    host: true,
    strictPort: false,
    proxy: {
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