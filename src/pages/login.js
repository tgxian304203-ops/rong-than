// src/pages/login.js
// Nhiệm vụ: Đăng nhập.

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { useAuth } from "../store/authStore.js";
import { useUI } from "../store/uiStore.js";
import { validateUserId } from "../utils/validate.js";
import { IconEye, IconEyeOff } from "../components/Icons.js";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useUI();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    const idCheck = validateUserId(userId);
    if (!idCheck.ok) {
      setError(idCheck.error);
      return;
    }
    if (!password) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    setSubmitting(true);
    const res = await login({ userId: idCheck.value, password });
    setSubmitting(false);

    if (res?.ok) {
      showToast("Đăng nhập thành công", "success", 2000);
      navigate("/", { replace: true });
    } else {
      setError(res?.error || "Đăng nhập thất bại");
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
      <HeaderBar variant="sub" title="Đăng nhập" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--font-2xl)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-text-primary)",
            marginBottom: "var(--space-6)",
          }}
        >
          ĐĂNG NHẬP
        </h1>

        <div style={{ marginBottom: "var(--space-4)" }}>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-2)",
            }}
          >
            ID tài khoản
          </div>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Nhập ID tài khoản..."
            autoComplete="username"
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
        </div>

        <div style={{ marginBottom: "var(--space-4)" }}>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-2)",
            }}
          >
            Mật khẩu
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
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
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
                color: "var(--color-text-secondary)",
              }}
            >
              {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
            </button>
          </div>
        </div>

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
          {submitting ? "Đang xử lý…" : "ĐĂNG NHẬP"}
        </button>

        <div
          style={{
            marginTop: "var(--space-5)",
            textAlign: "center",
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          Chưa có tài khoản?{" "}
          <Link
            to="/register"
            style={{ color: "var(--color-ai-text)", fontWeight: 600 }}
          >
            Đăng ký
          </Link>
        </div>
      </div>
    </div>
  );
}