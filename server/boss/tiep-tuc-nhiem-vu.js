// server/boss/tiep-tuc-nhiem-vu.js
// Nhiệm vụ: BOSS mới tiếp tục nhiệm vụ dang dở.
// Quy tắc dự án (PHẦN 01, mục 5):
//   - BOSS mới đọc lại yêu cầu + xác định tình trạng
//   - rồi tiếp tục nhiệm vụ.

import { WORK_STEP, WORK_STATUS } from "../state/luu-trang-thai.js";
import { logInfo, logWarn } from "../logs/ghi-log.js";

// ============================================================
// XÁC ĐỊNH BƯỚC TIẾP THEO
// ============================================================

/**
 * Dựa vào currentStep + status → quyết định BOSS mới nên làm gì.
 *
 * @param {object} p
 * @param {object} p.tinhTrang   - từ xac-dinh-tinh-trang
 * @returns {{
 *   action: string,
 *   reason: string,
 * }}
 */
export function quyetDinhBuocTiepTheo({ tinhTrang }) {
  if (!tinhTrang) {
    return {
      action: "restart",
      reason: "Không có tình trạng → bắt đầu lại từ phân tích yêu cầu",
    };
  }

  const step = tinhTrang.currentStep;
  const status = tinhTrang.status;

  switch (step) {
    case WORK_STEP.RECEIVED:
      return {
        action: "analyze",
        reason: "Vừa nhận yêu cầu → phân tích",
      };

    case WORK_STEP.CLASSIFIED:
      return {
        action: "write_format",
        reason: "Đã phân loại → viết format điều phối lính",
      };

    case WORK_STEP.NEED_WEB:
      return {
        action: "web_search",
        reason: "Đang cần tra Web → chạy tìm kiếm",
      };

    case WORK_STEP.WEB_DONE:
      return {
        action: "write_format",
        reason: "Đã có dữ liệu Web → viết format điều phối lính",
      };

    case WORK_STEP.FORMAT_WRITTEN:
      return {
        action: "dispatch_soldier",
        reason: "Đã có format → giao cho Tiểu Não / gọi lính",
      };

    case WORK_STEP.SOLDIER_WORKING:
      return {
        action: "wait_soldier",
        reason: "Lính đang làm → chờ kết quả",
      };

    case WORK_STEP.SOLDIER_DONE:
      return {
        action: "evaluate",
        reason: "Lính đã xong → đánh giá kết quả",
      };

    case WORK_STEP.SANDBOX_RUNNING:
      return {
        action: "wait_sandbox",
        reason: "Sandbox đang chạy → chờ kết quả",
      };

    case WORK_STEP.SANDBOX_PASSED:
      return {
        action: "deliver",
        reason: "Sandbox đã PASS → trả kết quả cho Rồng Thần",
      };

    case WORK_STEP.SANDBOX_FAILED:
      return {
        action: "fix",
        reason: "Sandbox FAIL → viết format sửa, gọi lính sửa",
      };

    case WORK_STEP.FIXING:
      return {
        action: "wait_fix",
        reason: "Đang sửa code → chờ lính sửa xong",
      };

    case WORK_STEP.DELIVERED:
      return {
        action: "done",
        reason: "Đã trả kết quả cho User",
      };

    default:
      return {
        action: "restart",
        reason: `Bước không xác định (${step}) → bắt đầu lại`,
      };
  }
}

// ============================================================
// TIẾP TỤC
// ============================================================

/**
 * Trả về quyết định bước tiếp theo cho BOSS mới.
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.conversationId
 * @param {object} p.tinhTrang
 */
export async function tiepTucNhiemVu({ userId, conversationId, tinhTrang }) {
  const decision = quyetDinhBuocTiepTheo({ tinhTrang });

  await logInfo("BOSS mới quyết định bước tiếp theo", {
    userId,
    conversationId,
    action: decision.action,
    reason: decision.reason,
  });

  return {
    ok: true,
    action: decision.action,
    reason: decision.reason,
    tinhTrang,
  };
}

export default {
  quyetDinhBuocTiepTheo,
  tiepTucNhiemVu,
};