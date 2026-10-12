// src/api/projects.js
// Nhiệm vụ: API dự án
// - Danh sách, tạo, mở, tìm kiếm, xóa dự án
// - Tạo & quản lý cuộc trò chuyện trong dự án

import api from "./client.js";

// ============================================================
// DỰ ÁN
// ============================================================

export async function listProjects({ search = "" } = {}) {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return api.get(`/projects${q}`);
}

export async function getProject(projectId) {
  return api.get(`/projects/${encodeURIComponent(projectId)}`);
}

export async function createProject({ name, description = "" }) {
  return api.post("/projects", { name, description });
}

export async function updateProject(projectId, { name, description }) {
  return api.patch(`/projects/${encodeURIComponent(projectId)}`, {
    name,
    description,
  });
}

export async function deleteProject(projectId) {
  return api.del(`/projects/${encodeURIComponent(projectId)}`);
}

// ============================================================
// CUỘC TRÒ CHUYỆN TRONG DỰ ÁN
// ============================================================

export async function listProjectConversations(projectId) {
  return api.get(
    `/projects/${encodeURIComponent(projectId)}/conversations`
  );
}

export async function createProjectConversation(projectId, { title = null } = {}) {
  return api.post(
    `/projects/${encodeURIComponent(projectId)}/conversations`,
    { title }
  );
}

export async function deleteProjectConversation(projectId, conversationId) {
  return api.del(
    `/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(
      conversationId
    )}`
  );
}