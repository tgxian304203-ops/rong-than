// shared/validators/projectRules.js
// Nhiệm vụ: Quy tắc kiểm tra tên và mô tả dự án.

export const PROJECT_NAME_MIN = 1;
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 500;

// ============================================================
// KIỂM TRA TÊN
// ============================================================

export function validateProjectName(name) {
  if (!name || typeof name !== "string") {
    return { ok: false, error: "Tên dự án không được để trống" };
  }
  const trimmed = name.trim();
  if (trimmed.length < PROJECT_NAME_MIN) {
    return { ok: false, error: "Tên dự án không được để trống" };
  }
  if (trimmed.length > PROJECT_NAME_MAX) {
    return {
      ok: false,
      error: `Tên dự án không được vượt quá ${PROJECT_NAME_MAX} ký tự`,
    };
  }
  return { ok: true, value: trimmed };
}

// ============================================================
// KIỂM TRA MÔ TẢ
// ============================================================

export function validateProjectDescription(description) {
  if (description === undefined || description === null) {
    return { ok: true, value: "" };
  }
  if (typeof description !== "string") {
    return { ok: false, error: "Mô tả dự án phải là chuỗi" };
  }
  const trimmed = description.trim();
  if (trimmed.length > PROJECT_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Mô tả không được vượt quá ${PROJECT_DESCRIPTION_MAX} ký tự`,
    };
  }
  return { ok: true, value: trimmed };
}

// ============================================================
// KIỂM TRA TOÀN BỘ
// ============================================================

/**
 * @returns {{ok: boolean, value?: {name, description}, error?: string}}
 */
export function validateProject({ name, description = "" }) {
  const nameCheck = validateProjectName(name);
  if (!nameCheck.ok) return nameCheck;

  const descCheck = validateProjectDescription(description);
  if (!descCheck.ok) return descCheck;

  return {
    ok: true,
    value: {
      name: nameCheck.value,
      description: descCheck.value,
    },
  };
}

export default {
  PROJECT_NAME_MIN,
  PROJECT_NAME_MAX,
  PROJECT_DESCRIPTION_MAX,
  validateProjectName,
  validateProjectDescription,
  validateProject,
};