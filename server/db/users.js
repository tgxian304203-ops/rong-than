// server/db/users.js
// Nhiệm vụ: Collection users — tài khoản.
// Theo yêu cầu dự án: đăng nhập trực tiếp trên giao diện,
// lưu mật khẩu thẳng vào MongoDB, KHÔNG hash, KHÔNG JWT.
//
// LƯU Ý: File này KHÔNG import từ file trung gian nào.
// Nó đọc MongoDB từ biến toàn cục do server/index.js khởi tạo.

const COL_NAME = "users";

function col() {
  const db = global.__rongThanDB__;
  if (!db) {
    throw new Error(
      "[Rồng Thần][db] Chưa có kết nối MongoDB. server/index.js phải gọi connectDB() trước."
    );
  }
  return db.collection(COL_NAME);
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
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// TÌM USER
// ============================================================

export async function findByUserId(userId) {
  return col().findOne({ userId });
}

export async function findById(id) {
  return col().findOne({ _id: id });
}

// ============================================================
// CẬP NHẬT
// ============================================================

export async function updateUserId(oldUserId, newUserId) {
  const res = await col().updateOne(
    { userId: oldUserId },
    { $set: { userId: newUserId, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function updatePassword(userId, newPassword) {
  const res = await col().updateOne(
    { userId },
    { $set: { password: newPassword, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteUser(userId) {
  const res = await col().deleteOne({ userId });
  return res.deletedCount > 0;
}

// ============================================================
// KIỂM TRA TỒN TẠI
// ============================================================

export async function userIdExists(userId) {
  const found = await col().findOne({ userId }, { projection: { _id: 1 } });
  return !!found;
}