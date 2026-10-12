// server/db/daiNaoModels.js
// Nhiệm vụ: Collection daiNaoModels — model của Đại Não.

const COL_NAME = "daiNaoModels";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function upsertModel({
  tier = "dai-nao",
  taskType,
  name,
  provider,
  priority = 1,
}) {
  const now = new Date();
  const res = await col().updateOne(
    { tier, taskType, name, provider },
    {
      $set: { tier, taskType, name, provider, priority, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return res.upsertedCount > 0 || res.modifiedCount > 0;
}

export async function listByTask(taskType) {
  return col()
    .find({ tier: "dai-nao", taskType })
    .sort({ priority: 1 })
    .toArray();
}

export async function listAll() {
  return col()
    .find({ tier: "dai-nao" })
    .sort({ taskType: 1, priority: 1 })
    .toArray();
}

export async function getActiveModel(taskType) {
  return col().findOne(
    { tier: "dai-nao", taskType, isActive: true },
    { sort: { priority: 1 } }
  );
}

export async function setActiveModel(taskType, modelName) {
  const now = new Date();
  await col().updateMany(
    { tier: "dai-nao", taskType },
    { $set: { isActive: false, updatedAt: now } }
  );
  const res = await col().updateOne(
    { tier: "dai-nao", taskType, name: modelName },
    { $set: { isActive: true, updatedAt: now } }
  );
  return res.modifiedCount > 0;
}

export async function deleteModel(taskType, name, provider) {
  const res = await col().deleteOne({
    tier: "dai-nao",
    taskType,
    name,
    provider,
  });
  return res.deletedCount > 0;
}