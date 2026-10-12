// server/db/projects.js
// Nhiệm vụ: Collection projects — dự án.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function projectsCol() {
  return col(COLLECTIONS.projects);
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
  const res = await projectsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
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
  return projectsCol()
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getProject(userId, projectId) {
  const _id = toObjectId(projectId);
  if (!_id) return null;
  return projectsCol().findOne({ _id, userId });
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

  const res = await projectsCol().updateOne({ _id, userId }, { $set: set });
  return res.modifiedCount > 0;
}

// ============================================================
// XÓA
// ============================================================

export async function deleteProject(userId, projectId) {
  const _id = toObjectId(projectId);
  if (!_id) return false;
  const res = await projectsCol().deleteOne({ _id, userId });
  return res.deletedCount > 0;
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