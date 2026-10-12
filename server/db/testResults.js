// server/db/testResults.js
// Nhiệm vụ: Collection testResults — kết quả chi tiết từng bài test.

const COL_NAME = "testResults";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function saveTestResult({ runId, name, status, message = "" }) {
  const doc = {
    runId: String(runId),
    name,
    status,
    message,
    createdAt: new Date(),
  };
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function listByRun(runId) {
  return col()
    .find({ runId: String(runId) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function hasFailure(runId) {
  const found = await col().findOne({
    runId: String(runId),
    status: { $in: ["FAIL", "ERROR"] },
  });
  return !!found;
}