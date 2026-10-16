// src/pages/change-password.js
// Nhiệm vụ: Đổi mật khẩu.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { useAuth } from "../store/authStore.js";
import { useUI } from "../store/uiStore.js";
import { validatePassword, validatePasswordConfirm } from "../utils/validate.js";
import { IconLock } from "../components/Icons.js";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { changePassword } = useAuth();
  const { showToast } = useUI();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!current) {
      setError("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    const p1 = validatePassword(next);
    if (!p1.ok) {
      setError(p1.error);
      return;
    }
    const p2 = validatePasswordConfirm(next, confirm);
    if (!p2.ok) {
      setError(p2.error);
      return;
    }

    setSubmitting(true);
    const res = await changePassword({
      currentPassword: current,
      newPassword: next,
      confirmPassword: confirm,
    });
    setSubmitting(false);

    if (res?.ok) {
      showToast("Đã đổi mật khẩu", "success", 2500);
      setCurrent("");
      setNext("");
      setConfirm("");
      navigate("/account");
    } else {
      setError(res?.error || "Đổi mật khẩu thất bại");
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
      <HeaderBar variant="sub" title="Đổi mật khẩu" />

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
          <IconLock size={24} />
          ĐỔI MẬT KHẨU
        </h1>

        <PasswordField
          label="Mật khẩu hiện tại"
          value={current}
          onChange={setCurrent}
          visible={showCurrent}
          onToggleVisible={() => setShowCurrent((v) => !v)}
          placeholder="Nhập mật khẩu hiện tại..."
        />
        <PasswordField
          label="Mật khẩu mới"
          value={next}
          onChange={setNext}
          visible={showNext}
          onToggleVisible={() => setShowNext((v) => !v)}
          placeholder="Nhập mật khẩu mới..."
        />
        <PasswordField
          label="Xác nhận mật khẩu mới"
          value={confirm}
          onChange={setConfirm}
          visible={showConfirm}
          onToggleVisible={() => setShowConfirm((v) => !v)}
          placeholder="Nhập lại mật khẩu mới..."
        />

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
          {submitting ? "Đang xử lý…" : "Xác nhận đổi"}
        </button>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  placeholder,
}) {
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
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
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
          aria-label={visible ? "Ẩn" : "Hiện"}
          onClick={onToggleVisible}
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
          {visible ? "🙈" : "👁"}
        </button>
      </div>
    </div>
  );
}