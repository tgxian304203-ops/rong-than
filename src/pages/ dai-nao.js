// src/pages/dai-nao.js
// Nhiệm vụ: Trang quản lý API Key của Đại Não.
// Quy tắc dự án (PHẦN 04, mục 11):
//   - Ô nhập key + 👁 + ▶ Run (dùng KeyInput)
//   - 3 nhóm: GROQ / GEMINI / OPENROUTER
//   - 🔥 còn quota, 😓 hết quota
//   - × xóa riêng key
//   - Mỗi nhóm cuộn dọc RIÊNG
//   - KHÔNG có nút Lưu Key / Xóa Key riêng
//   - Dữ liệu key Đại Não độc lập với Tiểu Não và Web

import React, { useCallback, useEffect, useState } from "react";
import HeaderBar from "../components/HeaderBar.js";
import KeyInput from "../components/KeyInput.js";
import ProviderGroup from "../components/ProviderGroup.js";
import { useUI } from "../store/uiStore.js";
import { daiNaoKeys } from "../api/keys.js";

export default function DaiNao() {
  const { showToast } = useUI();
  const [groups, setGroups] = useState({ groq: [], gemini: [], openrouter: [] });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // ============================================================
  // TẢI DANH SÁCH KEY
  // ============================================================
  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await daiNaoKeys.list();
      setGroups({
        groq: res?.providers?.groq || [],
        gemini: res?.providers?.gemini || [],
        openrouter: res?.providers?.openrouter || [],
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

  // ============================================================
  // RUN — kiểm tra và thêm key
  // ============================================================
  const handleRun = async (rawKey) => {
    setRunning(true);
    try {
      const res = await daiNaoKeys.verify(rawKey);
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

  // ============================================================
  // XÓA 1 KEY
  // ============================================================
  const handleDeleteKey = async (item) => {
    try {
      await daiNaoKeys.remove(item.id);
      setGroups((prev) => ({
        groq: prev.groq.filter((k) => k.id !== item.id),
        gemini: prev.gemini.filter((k) => k.id !== item.id),
        openrouter: prev.openrouter.filter((k) => k.id !== item.id),
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
      <HeaderBar variant="sub" title="Đại Não" />

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
          🧠 ĐẠI NÃO
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
          label="GROQ"
          items={groups.groq}
          onDeleteKey={handleDeleteKey}
        />
        <ProviderGroup
          label="GEMINI"
          items={groups.gemini}
          onDeleteKey={handleDeleteKey}
        />
        <ProviderGroup
          label="OPENROUTER"
          items={groups.openrouter}
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