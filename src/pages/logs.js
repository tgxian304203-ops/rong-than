// src/pages/logs.js
// Nhiệm vụ: Rồng Thần Logs.
// Quy tắc dự án (PHẦN 04, mục 20):
//   - Điểm vào: nhấn ⋮ ở màn hình chat chính
//   - Trạng thái server: chỉ hiển thị khi backend cung cấp
//   - Ô tìm kiếm log
//   - Bộ lọc mức: Tất cả / INFO / WARN / ERROR / DEBUG
//   - Danh sách log (cuộn)
//   - Tự động cuộn: BẬT/TẮT
//   - Nút Xóa Logs (KHÔNG icon thùng rác, phải xác nhận)
//   - Nút ⬇ Tải Logs (.txt)
//   - KHÔNG coi dữ liệu minh họa là log thật

import React, { useCallback, useEffect, useRef, useState } from "react";
import HeaderBar from "../components/HeaderBar.js";
import LogRow from "../components/LogRow.js";
import LogFilter from "../components/LogFilter.js";
import EmptyState from "../components/EmptyState.js";
import { useUI } from "../store/uiStore.js";
import {
  fetchLogs,
  getServerStatus,
  clearLogs,
  downloadLogsTxt,
  streamLogs,
} from "../api/logs.js";

export default function Logs() {
  const { confirm, showToast } = useUI();

  const [items, setItems] = useState([]);
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [serverStatus, setServerStatus] = useState("unknown"); // "online" | "offline" | "unknown"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const scrollRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // ============================================================
  // TẢI LOGS
  // ============================================================
  const load = useCallback(
    async (opts = {}) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchLogs({
          level,
          search,
          limit: 300,
          ...opts,
        });
        setItems(res?.items || []);
        if (res?.serverStatus) setServerStatus(res.serverStatus);
      } catch (err) {
        setError(err?.message || "Không tải được log");
        setServerStatus("offline");
      } finally {
        setLoading(false);
      }
    },
    [level, search]
  );

  // ============================================================
  // TẢI TRẠNG THÁI SERVER + LOGS LẦN ĐẦU
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const st = await getServerStatus();
        if (!cancelled) {
          setServerStatus(st?.status || "unknown");
        }
      } catch {
        if (!cancelled) setServerStatus("offline");
      }
      if (!cancelled) await load();
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // RELOAD KHI ĐỔI LEVEL
  // ============================================================
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  // ============================================================
  // TÌM KIẾM — DEBOUNCE 400ms
  // ============================================================
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      load();
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ============================================================
  // SSE — nhận log mới (nếu backend hỗ trợ)
  // ============================================================
  useEffect(() => {
    const cancel = streamLogs(
      (item) => {
        if (!item) return;
        if (level !== "all" && item.level !== level) return;
        setItems((prev) => [...prev, item]);
      },
      () => {
        // Không có SSE — bỏ qua, không báo lỗi người dùng
      }
    );
    return () => cancel && cancel();
  }, [level]);

  // ============================================================
  // TỰ ĐỘNG CUỘN
  // ============================================================
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, autoScroll]);

  // ============================================================
  // XÓA LOGS
  // ============================================================
  const handleClear = async () => {
    const yes = await confirm({
      title: "Xóa Logs",
      message:
        "Chỉ xóa log trong phạm vi backend cho phép. Log gốc trên máy chủ sẽ KHÔNG bị xóa nếu chưa được thiết kế cho phép.",
      confirmText: "Xóa",
      cancelText: "Hủy",
      tone: "danger",
    });
    if (!yes) return;

    try {
      await clearLogs();
      setItems([]);
      showToast("Đã xóa log trong ứng dụng", "success", 2500);
    } catch (err) {
      showToast(err?.message || "Xóa log thất bại", "error", 4000);
    }
  };

  // ============================================================
  // TẢI LOGS (.txt)
  // ============================================================
  const handleDownload = async () => {
    try {
      const blob = await downloadLogsTxt({ level, search });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `rong-than-logs-${ts}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Đã tải log", "success", 2000);
    } catch (err) {
      showToast(err?.message || "Tải log thất bại", "error", 4000);
    }
  };

  // ============================================================
  // HIỂN THỊ TRẠNG THÁI SERVER
  // ============================================================
  const statusInfo = (() => {
    switch (serverStatus) {
      case "online":
        return { icon: "🟢", label: "Đang hoạt động", color: "var(--color-success)" };
      case "offline":
        return { icon: "🔴", label: "Không kết nối được", color: "var(--color-error)" };
      default:
        return { icon: "⚪", label: "Chưa xác định", color: "var(--color-text-muted)" };
    }
  })();

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
      <HeaderBar variant="sub" title="Rồng Thần Logs" />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-3)",
          gap: "var(--space-3)",
          overflow: "hidden",
        }}
      >
        {/* TRẠNG THÁI SERVER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span>Trạng thái:</span>
          <span style={{ color: statusInfo.color, fontWeight: 600 }}>
            {statusInfo.icon} {statusInfo.label}
          </span>
        </div>

        {/* TÌM KIẾM */}
        <div
          className="glass-card"
          style={{
            display: "grid",
            gridTemplateColumns: "36px 1fr",
            alignItems: "center",
            minHeight: 42,
            padding: "0 var(--space-2)",
          }}
        >
          <span aria-hidden="true" style={{ textAlign: "center" }}>
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm Logs..."
            style={{
              width: "100%",
              height: 42,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-base)",
            }}
          />
        </div>

        {/* BỘ LỌC MỨC */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <LogFilter value={level} onChange={setLevel} />
        </div>

        {/* DANH SÁCH LOG */}
        <div
          ref={scrollRef}
          className="scroll-y"
          style={{
            flex: 1,
            minHeight: 120,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "rgba(0,0,0,0.25)",
            overflowY: "auto",
          }}
        >
          {loading && items.length === 0 ? (
            <EmptyState icon="⏳" title="Đang tải log…" />
          ) : error ? (
            <EmptyState icon="⚠" title="Lỗi tải log" subtitle={error} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="📭"
              title="Chưa có log nào"
              subtitle="Log mới sẽ xuất hiện khi có hoạt động."
            />
          ) : (
            items.map((log, idx) => <LogRow key={log.id || idx} log={log} />)
          )}
        </div>

        {/* TỰ ĐỘNG CUỘN */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "var(--font-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span>Tự động cuộn:</span>
          <button
            type="button"
            onClick={() => setAutoScroll((v) => !v)}
            className="no-select glass-card"
            style={{
              minHeight: 36,
              padding: "0 var(--space-3)",
              color: autoScroll ? "var(--color-success)" : "var(--color-text-muted)",
              fontSize: "var(--font-sm)",
              fontWeight: 700,
              borderRadius: "var(--radius-md)",
              letterSpacing: "0.5px",
            }}
          >
            {autoScroll ? "BẬT" : "TẮT"}
          </button>
        </div>

        {/* NÚT XÓA LOGS + TẢI LOGS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2)",
          }}
        >
          <button
            type="button"
            onClick={handleClear}
            className="no-select"
            style={{
              minHeight: 48,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-error)",
              fontSize: "var(--font-base)",
              fontWeight: 700,
            }}
          >
            Xóa Logs
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="no-select"
            style={{
              minHeight: 48,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-primary)",
              fontSize: "var(--font-base)",
              fontWeight: 700,
            }}
          >
            ⬇ Tải Logs
          </button>
        </div>
      </div>
    </div>
  );
}