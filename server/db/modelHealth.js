// server/db/modelHealth.js
// Nhiệm vụ: Collection modelHealth — trạng thái khả dụng của model.

const COL_NAME = "modelHealth";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function report({
  tier,
  modelName,
  provider,
  status,
  note = "",
}) {
  const now = new Date();
  const res = await col().updateOne(
    { tier, modelName, provider },
    {
      $set: {
        tier,
        modelName,
        provider,
        status,
        note,
        lastCheckedAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

export async function get(tier, modelName, provider) {
  return col().findOne({ tier, modelName, provider });
}

export async function listByTier(tier) {
  return col().find({ tier }).sort({ updatedAt: -1 }).toArray();
}

export async function listAvailable(tier) {
  return col().find({ tier, status: "available" }).toArray();
}

export async function clearTier(tier) {
  const res = await col().deleteMany({ tier });
  return res.deletedCount;
}

export async function isAvailable(tier, modelName, provider) {
  const doc = await get(tier, modelName, provider);
  return doc?.status === "available";
}