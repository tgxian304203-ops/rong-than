// server/db/projects.js
// Nhiệm vụ: Collection projects — dự án.

import { ObjectId } from "mongodb";

const COL_NAME = "projects";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

// ============================================================
// TẠO
// ============================================================

export async function createProject({ userId, name, description = "" }) {
  const now = new Date();
  const doc = {
    userId,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId, id: String(res.insertedId) };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listProjects(userId, { search = "" } = {}) {
  const filter = { userId };
  if (search && search.trim()) {
    const k = search.trim();
    filter.$or = [
      { name: { $regex: k, $options: "i" } },
      { description: { $regex: k, $options: "i" } },
    ];
  }
  const items = await col()
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  return items.map((it) => ({ ...it, id: String(it._id) }));
}

export async function getProject(userId, projectId) {
  const _id = toObjectId(projectId);
  if (!_id) return null;
  const doc = await col().findOne({ _id, userId });
  if (!doc) return null;
  return { ...doc, id: String(doc._id) };
}

// ============================================================
// CẬP NHẬT
// ============================================================

export async function updateProject(userId, projectId, { name, description }) {
  const _id = toObjectId(projectId);
  if (!_id) return false;

  const set = { updatedAt: new Date() };
  if (typeof name === "string") set.name = name;
  if (typeof description === "string") set.description = description;

  const res = await col().updateOne({ _id, userId }, { $set: set });
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteProject(userId, projectId) {
  const _id = toObjectId(projectId);
  if (!_id) return false;
  const res = await col().deleteOne({ _id, userId });
  return res.deletedCount > 0;
}

export async function deleteProjectsByUser(userId) {
  const res = await col().deleteMany({ userId });
  return res.deletedCount;
}

// ============================================================
// TIỆN ÍCH
// ============================================================

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}