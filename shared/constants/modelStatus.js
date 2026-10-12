// shared/constants/modelStatus.js
// Nhiệm vụ: 8 trạng thái model.
// Dùng để theo dõi khả dụng của model trong quá trình dò/gọi.

export const MODEL_STATUS = {
  // Model còn dùng được
  AVAILABLE: "available",

  // Hết quota
  NO_QUOTA: "no-quota",

  // Đang lỗi
  ERROR: "error",

  // Chưa kiểm tra
  UNKNOWN: "unknown",

  // Đang được chọn làm model hiện tại
  ACTIVE: "active",

  // Đang bị tạm khóa (ví dụ đang được kiểm tra)
  LOCKED: "locked",

  // Bị bỏ qua (do không khớp nhiệm vụ)
  SKIPPED: "skipped",

  // Đã ngừng sử dụng (bị thay bởi model khác)
  RETIRED: "retired",
};

export const MODEL_STATUS_LIST = Object.values(MODEL_STATUS);

export function isValidModelStatus(status) {
  return MODEL_STATUS_LIST.includes(status);
}

export function isUsableStatus(status) {
  return status === MODEL_STATUS.AVAILABLE || status === MODEL_STATUS.UNKNOWN;
}

export default {
  MODEL_STATUS,
  MODEL_STATUS_LIST,
  isValidModelStatus,
  isUsableStatus,
};