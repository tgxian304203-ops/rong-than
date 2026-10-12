// src/pages/delete-account.js
// Nhiệm vụ: Xóa tài khoản.
// Quy tắc dự án (PHẦN 04, mục 17):
//   - Có hậu quả lớn → phải xác nhận rõ ràng
//   - Phải có cách hủy thao tác
//   - KHÔNG xóa ngay khi vừa vào trang
//   - Chỉ thực hiện khi User xác nhận
//   - Backend phải xác minh quyền
//   - Chỉ báo thành công khi backend xác nhận
//   - KHÔNG tự thêm bước/trường mới ngoài đặc tả

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderBar from "../components/HeaderBar.js";
import { useAuth } from "../store/authStore.js";
import { useUI } from "../store/uiStore.js";

const CONFIRM_WORD = "XOA";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const { deleteAccount } = useAuth();
  const { confirm, showToast } = useUI();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setError("");

    if (!password) {
      setError("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Vui lòng nhập "${CONFIRM_WORD}" để xác nhận`);
      return;
    }

    // Xác nhận lần cuối trước khi gọi backend
    const yes = await confirm({
      title: "Xác nhận xóa tài khoản",
      message:
        "Hành động này KHÔNG THỂ hoàn tác. Toàn bộ dữ liệu tài khoản, dự án, hội thoại và key đã lưu sẽ bị xóa vĩnh viễn.",
      confirmText: "Xóa vĩnh viễn",
      cancelText: "Hủy",
      tone: "danger",
    });
    if (!yes) return;

    setSubmitting(true);
    const res = await deleteAccount({
      currentPassword: password,
      confirmText: CONFIRM_WORD,
    });
    setSubmitting(false);

    if (res?.ok) {
      showToast("Tài khoản đã được xóa", "success", 3000);
      navigate("/", { replace: true });
    } else {
      setError(res?.error || "Xóa tài khoản thất bại");
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
      <HeaderBar variant="sub" title="Xóa tài khoản" />

      <div className="scroll-y" style={{ flex: 1, padding: "var(--space-4)" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: "var(--font-xl)",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "var(--color-error)",
            marginBottom: "var(--space-4)",
          }}
        >
          🗑️ XÓA TÀI KHOẢN
        </h1>

        <div
          className="glass-card"
          style={{
            padding: "var(--space-4)",
            borderColor: "var(--color-error)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--color-error)" }}>
            ⚠ Cảnh báo:
          </strong>{" "}
          Hành động này sẽ xóa vĩnh viễn tài khoản, toàn bộ dự án, hội thoại,
          API key đã lưu và không thể khôi phục.
        </div>

        <div style={{ marginBottom: "var(--space-4)" }}>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-2)",
            }}
          >
            Mật khẩu hiện tại
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
        </div>

        <div style={{ marginBottom: "var(--space-4)" }}>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: "var(--space-2)",
            }}
          >
            Nhập <strong style={{ color: "var(--color-error)" }}>{CONFIRM_WORD}</strong> để xác nhận
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`Nhập "${CONFIRM_WORD}"...`}
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2)",
            marginTop: "var(--space-5)",
          }}
        >
          <button
            type="button"
            onClick={() => navigate("/account")}
            disabled={submitting}
            className="no-select"
            style={{
              minHeight: 48,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-base)",
              fontWeight: 600,
            }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="no-select"
            style={{
              minHeight: 48,
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-error)",
              color: "#fff",
              fontSize: "var(--font-base)",
              fontWeight: 700,
            }}
          >
            {submitting ? "Đang xử lý…" : "Xóa tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}