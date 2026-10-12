// src/pages/register.js
// Nhiệm vụ: Đăng ký.
// Quy tắc dự án (PHẦN 04, mục 18):
//   - 3 trường: ID tài khoản / Mật khẩu / Xác nhận mật khẩu
//   - 👁 trên từng trường mật khẩu
//   - Kiểm tra định dạng ID, ID chưa dùng
//   - Mật khẩu + xác nhận phải trùng
//   - KHÔNG tạo tài khoản nếu dữ liệu không hợp lệ
//   - KHÔNG lưu mật khẩu dạng văn bản thuần

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { useAuth } from "../store/authStore.js";
import { useUI } from "../store/uiStore.js";
import {
  validateUserId,
  validatePassword,
  validatePasswordConfirm,
} from "../utils/validate.js";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { showToast } = useUI();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    const idCheck = validateUserId(userId);
    if (!idCheck.ok) {
      setError(idCheck.error);
      return;
    }
    const p1 = validatePassword(password);
    if (!p1.ok) {
      setError(p1.error);
      return;
    }
    const p2 = validatePasswordConfirm(password, confirm);
    if (!p2.ok) {
      setError(p2.error);
      return;
    }

    setSubmitting(true);
    const res = await register({
      userId: idCheck.value,
      password,
      confirmPassword: confirm,
    });
    setSubmitting(false);

    if (res?.ok) {
      showToast("Đăng ký thành công", "success", 2500);
      navigate("/", { replace: true });
    } else {
      setError(res?.error || "Đăng ký thất bại");
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
      <HeaderBar variant="sub" title="Đăng ký" />

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
          ĐĂNG KÝ
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

        <PasswordInput
          label="Mật khẩu"
          value={password}
          onChange={setPassword}
          visible={showPassword}
          onToggleVisible={() => setShowPassword((v) => !v)}
          placeholder="Nhập mật khẩu..."
        />
        <PasswordInput
          label="Xác nhận mật khẩu"
          value={confirm}
          onChange={setConfirm}
          visible={showConfirm}
          onToggleVisible={() => setShowConfirm((v) => !v)}
          placeholder="Nhập lại mật khẩu..."
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
          {submitting ? "Đang xử lý…" : "ĐĂNG KÝ"}
        </button>

        <div
          style={{
            marginTop: "var(--space-5)",
            textAlign: "center",
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          Đã có tài khoản?{" "}
          <Link
            to="/login"
            style={{ color: "var(--color-ai-text)", fontWeight: 600 }}
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
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
          autoComplete="new-password"
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