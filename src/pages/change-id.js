// src/pages/change-id.js
// Nhiệm vụ: Đổi ID tài khoản.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { useAuth } from "../store/authStore.js";
import { useUI } from "../store/uiStore.js";
import { validateUserId } from "../utils/validate.js";
import { IconIdCard } from "../components/Icons.js";

export default function ChangeId() {
  const navigate = useNavigate();
  const { user, changeUserId } = useAuth();
  const { showToast } = useUI();

  const [newId, setNewId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    const idCheck = validateUserId(newId);
    if (!idCheck.ok) {
      setError(idCheck.error);
      return;
    }
    if (!password) {
      setError("Vui lòng nhập mật khẩu hiện tại để xác nhận");
      return;
    }

    setSubmitting(true);
    const res = await changeUserId({
      currentPassword: password,
      newUserId: idCheck.value,
    });
    setSubmitting(false);

    if (res?.ok) {
      showToast("Đã đổi ID tài khoản", "success", 2500);
      setPassword("");
      setNewId("");
      navigate("/account");
    } else {
      setError(res?.error || "Đổi ID thất bại");
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
      <HeaderBar variant="sub" title="Đổi ID tài khoản" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--font-xl)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-primary)",
            marginBottom: "var(--space-5)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
          }}
        >
          <IconIdCard size={24} />
          ĐỔI ID TÀI KHOẢN
        </h1>

        <Field label="ID hiện tại">
          <div
            className="glass-card"
            style={{
              padding: "0 var(--space-3)",
              minHeight: 46,
              display: "flex",
              alignItems: "center",
              color: "var(--color-text-secondary)",
              fontSize: "var(--font-base)",
            }}
          >
            {user?.userId || "—"}
          </div>
        </Field>

        <Field label="ID mới">
          <input
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="Nhập ID mới..."
            autoComplete="off"
            spellCheck={false}
            className="glass-card"
            style={{
              width: "100%",
              height: 46,
              padding: "0 var(--space-3)",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-base)",
            }}
          />
        </Field>

        <Field label="Mật khẩu hiện tại (để xác nhận)">
          <div
            className="glass-card"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 44px",
              alignItems: "center",
              minHeight: 46,
              padding: "0 var(--space-1) 0 var(--space-3)",
            }}
          >
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại..."
              autoComplete="current-password"
              style={{
                width: "100%",
                height: 46,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--color-text-primary)",
                fontSize: "var(--font-base)",
              }}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ẩn" : "Hiện"}
              onClick={() => setShowPassword((v) => !v)}
              className="no-select"
              style={{
                width: 44,
                height: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--font-lg)",
                color: "var(--color-text-secondary)",
              }}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
        </Field>

        {error ? (
          <div
            style={{
              color: "var(--color-error)",
              fontSize: "var(--font-sm)",
              marginTop: "var(--space-2)",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="no-select"
          style={{
            marginTop: "var(--space-5)",
            width: "100%",
            minHeight: 48,
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-success)",
            color: "#04150a",
            fontSize: "var(--font-md)",
            fontWeight: 700,
          }}
        >
          {submitting ? "Đang xử lý…" : "Xác nhận"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <div
        style={{
          fontSize: "var(--font-sm)",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-2)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}