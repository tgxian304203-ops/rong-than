// src/store/projectStore.js
// Nhiệm vụ: Quản lý dự án
// - Danh sách dự án
// - Tạo / mở / xóa / tìm kiếm dự án
// - Quản lý cuộc trò chuyện trong dự án

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import * as projectApi from "../api/projects.js";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [projectConversations, setProjectConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  // ============================================================
  // TẢI DANH SÁCH DỰ ÁN
  // ============================================================
  const loadProjects = useCallback(async (keyword = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await projectApi.listProjects({ search: keyword });
      setProjects(res?.items || []);
      return { ok: true, items: res?.items || [] };
    } catch (err) {
      const msg = err?.message || "Không tải được danh sách dự án";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // TÌM KIẾM (lọc client-side nếu backend không filter)
  // ============================================================
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const k = search.trim().toLowerCase();
    return projects.filter(
      (p) =>
        p.name?.toLowerCase().includes(k) ||
        p.description?.toLowerCase().includes(k)
    );
  }, [projects, search]);

  // ============================================================
  // TẠO DỰ ÁN
  // ============================================================
  const createProject = useCallback(async ({ name, description = "" }) => {
    setError(null);
    try {
      const res = await projectApi.createProject({ name, description });
      const proj = res?.project;
      if (proj) setProjects((prev) => [proj, ...prev]);
      return { ok: true, project: proj };
    } catch (err) {
      const msg = err?.message || "Tạo dự án thất bại";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  // ============================================================
  // MỞ DỰ ÁN
  // ============================================================
  const openProject = useCallback(async (projectId) => {
    setError(null);
    setLoading(true);
    try {
      const res = await projectApi.getProject(projectId);
      setActiveProject(res?.project || null);
      const convRes = await projectApi.listProjectConversations(projectId);
      setProjectConversations(convRes?.items || []);
      return { ok: true };
    } catch (err) {
      const msg = err?.message || "Không mở được dự án";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // XÓA DỰ ÁN
  // ============================================================
  const deleteProject = useCallback(async (projectId) => {
    setError(null);
    try {
      await projectApi.deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (activeProject?.id === projectId) {
        setActiveProject(null);
        setProjectConversations([]);
      }
      return { ok: true };
    } catch (err) {
      const msg = err?.message || "Xóa dự án thất bại";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, [activeProject]);

  // ============================================================
  // TẠO CUỘC TRÒ CHUYỆN TRONG DỰ ÁN
  // ============================================================
  const createConversationInProject = useCallback(
    async (projectId, { title = null } = {}) => {
      setError(null);
      try {
        const res = await projectApi.createProjectConversation(projectId, {
          title,
        });
        const convo = res?.conversation;
        if (convo) setProjectConversations((prev) => [convo, ...prev]);
        return { ok: true, conversation: convo };
      } catch (err) {
        const msg = err?.message || "Tạo cuộc trò chuyện thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

  // ============================================================
  // XÓA CUỘC TRÒ CHUYỆN TRONG DỰ ÁN
  // ============================================================
  const deleteConversationInProject = useCallback(
    async (projectId, conversationId) => {
      setError(null);
      try {
        await projectApi.deleteProjectConversation(projectId, conversationId);
        setProjectConversations((prev) =>
          prev.filter((c) => c.id !== conversationId)
        );
        return { ok: true };
      } catch (err) {
        const msg = err?.message || "Xóa cuộc trò chuyện thất bại";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    []
  );

  // ============================================================
  // RESET
  // ============================================================
  const reset = useCallback(() => {
    setProjects([]);
    setActiveProject(null);
    setProjectConversations([]);
    setSearch("");
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      projects,
      filteredProjects,
      activeProject,
      projectConversations,
      loading,
      error,
      search,
      setSearch,
      loadProjects,
      createProject,
      openProject,
      deleteProject,
      createConversationInProject,
      deleteConversationInProject,
      reset,
    }),
    [
      projects,
      filteredProjects,
      activeProject,
      projectConversations,
      loading,
      error,
      search,
      loadProjects,
      createProject,
      openProject,
      deleteProject,
      createConversationInProject,
      deleteConversationInProject,
      reset,
    ]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject phải dùng bên trong <ProjectProvider>");
  return ctx;
}