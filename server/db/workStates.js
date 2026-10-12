// server/db/workStates.js
// Nhiệm vụ: Collection workStates — trạng thái công việc đang làm dở.

const COL_NAME = "workStates";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function upsertState({
  userId,
  conversationId,
  userRequest,
  currentStep,
  status,
  context = {},
}) {
  const now = new Date();
  const res = await col().updateOne(
    { userId, conversationId: String(conversationId) },
    {
      $set: {
        userId,
        conversationId: String(conversationId),
        userRequest,
        currentStep,
        status,
        context,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

export async function getState(userId, conversationId) {
  return col().findOne({
    userId,
    conversationId: String(conversationId),
  });
}

export async function listByUser(userId) {
  return col().find({ userId }).sort({ updatedAt: -1 }).toArray();
}

export async function setStep(userId, conversationId, currentStep, status) {
  const res = await col().updateOne(
    { userId, conversationId: String(conversationId) },
    { $set: { currentStep, status, updatedAt: new Date() } }
  );
  return res.modifiedCount > 0;
}

export async function clearState(userId, conversationId) {
  const res = await col().deleteOne({
    userId,
    conversationId: String(conversationId),
  });
  return res.deletedCount > 0;
}