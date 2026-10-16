// src/App.js
// Nhiệm vụ: Định tuyến toàn bộ ứng dụng Rồng Thần.
// Bọc 4 Provider + bọc class bg-dragon-overlay để mọi trang đều thấy ảnh nền.

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./store/authStore.js";
import { UIProvider } from "./store/uiStore.js";
import { ProjectProvider } from "./store/projectStore.js";
import { ChatProvider } from "./store/chatStore.js";

import SideMenu from "./components/SideMenu.js";
import ConfirmDialog from "./components/ConfirmDialog.js";

// ---- PAGES ----
import ChatMain from "./pages/index.js";
import NewChat from "./pages/new-chat.js";
import ProjectsList from "./pages/projects-list.js";
import ProjectDetail from "./pages/project-detail.js";
import History from "./pages/history.js";
import Settings from "./pages/settings.js";
import PasteKey from "./pages/paste-key.js";
import DaiNao from "./pages/dai-nao.js";
import TieuNao from "./pages/tieu-nao.js";
import WebPage from "./pages/web.js";
import Account from "./pages/account.js";
import ChangeId from "./pages/change-id.js";
import ChangePassword from "./pages/change-password.js";
import DeleteAccount from "./pages/delete-account.js";
import Register from "./pages/register.js";
import Login from "./pages/login.js";
import Logs from "./pages/logs.js";

export default function App() {
  return (
    <AuthProvider>
      <UIProvider>
        <ProjectProvider>
          <ChatProvider>
            <div
              className="bg-dragon-overlay"
              style={{
                height: "100%",
                width: "100%",
                overflow: "hidden",
              }}
            >
              <Routes>
                {/* Màn hình chat chính */}
                <Route path="/" element={<ChatMain />} />
                <Route path="/new-chat" element={<NewChat />} />

                {/* Dự án */}
                <Route path="/projects" element={<ProjectsList />} />
                <Route path="/projects/:projectId" element={<ProjectDetail />} />

                {/* Lịch sử trò chuyện */}
                <Route path="/history" element={<History />} />

                {/* Cài đặt */}
                <Route path="/settings" element={<Settings />} />

                {/* Dán Key */}
                <Route path="/paste-key" element={<PasteKey />} />
                <Route path="/paste-key/dai-nao" element={<DaiNao />} />
                <Route path="/paste-key/tieu-nao" element={<TieuNao />} />
                <Route path="/paste-key/web" element={<WebPage />} />

                {/* Cài đặt tài khoản */}
                <Route path="/account" element={<Account />} />
                <Route path="/account/change-id" element={<ChangeId />} />
                <Route
                  path="/account/change-password"
                  element={<ChangePassword />}
                />
                <Route path="/account/delete" element={<DeleteAccount />} />

                {/* Đăng ký / Đăng nhập */}
                <Route path="/register" element={<Register />} />
                <Route path="/login" element={<Login />} />

                {/* Rồng Thần Logs */}
                <Route path="/logs" element={<Logs />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>

              {/* Thành phần toàn cục */}
              <SideMenu />
              <ConfirmDialog />
            </div>
          </ChatProvider>
        </ProjectProvider>
      </UIProvider>
    </AuthProvider>
  );
}