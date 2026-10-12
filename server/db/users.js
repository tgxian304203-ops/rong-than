// server/db/users.js
// Nhiệm vụ: Collection users — tài khoản.
// Theo yêu cầu dự án: đăng nhập trực tiếp trên giao diện,
// lưu mật khẩu thẳng vào MongoDB, KHÔNG hash, KHÔNG JWT.

import { col, COLLECTIONS } from "./index.js";

export function usersCol() {
  return col(COLLECTIONS.users);
}

// ============================================================
// TẠO USER
// ============================================================

export async function createUser({ userId, password }) {
  const now = new Date();
  const doc = {
    userId,
    password,
    createdAt: now,
    updatedAt: now,
  };
  const res = await usersCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// TÌM USER
// ============================================================

export async function findByUserId(userId) {
  return usersCol().findOne({ userId });
}

export async function findById(id) {
  return usersCol().findOne({ _id: id });
}

// ============================================================
// CẬP NHẬT
// ============================================================

export async function updateUserId(oldUserId, newUserId) {
  const res = await usersCol().updateOne(
    { userId: oldUserId },
    { $set: { userId: newUserId, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function updatePassword(userId, newPassword) {
  const res = await usersCol().updateOne(
    { userId },
    { $set: { password: newPassword, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteUser(userId) {
  const res = await usersCol().deleteOne({ userId });
  return res.deletedCount > 0;
}

// ============================================================
// KIỂM TRA TỒN TẠI
// ============================================================

export async function userIdExists(userId) {
  const found = await usersCol().findOne(
    { userId },
    { projection: { _id: 1 } }
  );
  return !!found;
}