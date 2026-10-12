// src/pages/web.js
// Nhiệm vụ: Trang quản lý API Key cho Web.
// Quy tắc dự án (PHẦN 04, mục 13):
//   - 3 nhà cung cấp: TAVILY / SERPJET / BRAVE SEARCH
//   - Ô nhập + 👁 + ▶ Run
//   - 🔥 / 😓, × xóa riêng key
//   - Mỗi nhóm cuộn dọc RIÊNG
//   - Dữ liệu Web ĐỘC LẬP với Đại Não và Tiểu Não
//   - KHÔNG có nút Lưu Key / Xóa Key riêng
//   - KHÔNG tự đổi tên SerpJet thành nhà cung cấp khác

import React, { useCallback, useEffect, useState } from "react";
import HeaderBar from "../components/HeaderBar.js";
import KeyInput from "../components/KeyInput.js";
import ProviderGroup from "../components/ProviderGroup.js";
import { useUI } from "../store/uiStore.js";
import { webKeys } from "../api/keys.js";

export default function WebPage() {
  const { showToast } = useUI();
  const [groups, setGroups] = useState({ tavily: [], serpjet: [], brave: [] });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await webKeys.list();
      setGroups({
        tavily: res?.providers?.tavily || [],
        serpjet: res?.providers?.serpjet || [],
        brave: res?.providers?.brave || [],
      });
    } catch (err) {
      showToast(err?.message || "Không tải được danh sách key", "error", 4000);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleRun = async (rawKey) => {
    setRunning(true);
    try {
      const res = await webKeys.verify(rawKey);
      if (res?.ok) {
        showToast(
          `Đã thêm key ${res.maskedKey || ""} vào ${String(res.provider || "").toUpperCase()}`,
          "success",
          3000
        );
        await loadKeys();
        return { ok: true };
      }
      const msg = res?.error || "Key không hợp lệ";
      showToast(msg, "error", 4000);
      return { ok: false, error: msg };
    } catch (err) {
      const msg = err?.message || "Không kiểm tra được key";
      showToast(msg, "error", 4000);
      return { ok: false, error: msg };
    } finally {
      setRunning(false);
    }
  };

  const handleDeleteKey = async (item) => {
    try {
      await webKeys.remove(item.id);
      setGroups((prev) => ({
        tavily: prev.tavily.filter((k) => k.id !== item.id),
        serpjet: prev.serpjet.filter((k) => k.id !== item.id),
        brave: prev.brave.filter((k) => k.id !== item.id),
      }));
      showToast("Đã xóa key", "success", 2000);
    } catch (err) {
      showToast(err?.message || "Xóa key thất bại", "error", 4000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <HeaderBar variant="sub" title="Web" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--font-xl)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-primary)",
            marginBottom: "var(--space-4)",
          }}
        >
          🌐 WEB
        </h1>

        <div style={{ marginBottom: "var(--space-5)" }}>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-2)",
            }}
          >
            API Key
          </div>
          <KeyInput onRun={handleRun} running={running} />
        </div>

        <ProviderGroup
          label="TAVILY"
          items={groups.tavily}
          onDeleteKey={handleDeleteKey}
        />
        <ProviderGroup
          label="SERPJET"
          items={groups.serpjet}
          onDeleteKey={handleDeleteKey}
        />
        <ProviderGroup
          label="BRAVE SEARCH"
          items={groups.brave}
          onDeleteKey={handleDeleteKey}
        />

        {loading ? (
          <div
            style={{
              textAlign: "center",
              fontSize: "var(--font-sm)",
              color: "var(--color-text-muted)",
              padding: "var(--space-4)",
            }}
          >
            Đang tải danh sách key…
          </div>
        ) : null}
      </div>
    </div>
  );
}