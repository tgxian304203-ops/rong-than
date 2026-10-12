// server/db/testResults.js
// Nhiệm vụ: Collection testResults — kết quả chi tiết của từng bài test
// trong 1 lần chạy Sandbox.

import { ObjectId } from "mongodb";
import { col, COLLECTIONS } from "./index.js";

export function testResultsCol() {
  return col(COLLECTIONS.testResults);
}

// ============================================================
// GHI
// ============================================================

/**
 * @param {object} p
 * @param {string} p.runId
 * @param {string} p.name           - tên bài test
 * @param {"PASS"|"FAIL"|"ERROR"} p.status
 * @param {string} [p.message]
 */
export async function saveTestResult({
  runId,
  name,
  status,
  message = "",
}) {
  const doc = {
    runId: String(runId),
    name,
    status,
    message,
    createdAt: new Date(),
  };
  const res = await testResultsCol().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

// ============================================================
// ĐỌC
// ============================================================

export async function listByRun(runId) {
  return testResultsCol()
    .find({ runId: String(runId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function hasFailure(runId) {
  const found = await testResultsCol().findOne({
    runId: String(runId),
    status: { $in: ["FAIL", "ERROR"] },
  });
  return !!found;
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