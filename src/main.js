// src/main.js
// Điểm khởi động web Rồng Thần
// Nhiệm vụ: mount React app vào #root và bọc Router

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";

// Import style nền tảng theo đúng sơ đồ thư mục
import "./styles/globals.css";
import "./styles/theme.css";
import "./styles/glass.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error(
    "[Rồng Thần] Không tìm thấy #root trong index.html. Kiểm tra lại index.html."
  );
}

const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);