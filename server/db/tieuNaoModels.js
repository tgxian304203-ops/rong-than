// server/db/tieuNaoModels.js
// Nhiệm vụ: Collection tieuNaoModels — model của Tiểu Não.

const COL_NAME = "tieuNaoModels";

function col() {
  const db = global.__rongThanDB__;
  if (!db) throw new Error("[Rồng Thần][db] Chưa có kết nối MongoDB.");
  return db.collection(COL_NAME);
}

export async function upsertModel({
  tier = "tieu-nao",
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
    .find({ tier: "tieu-nao", taskType })
    .sort({ priority: 1 })
    .toArray();
}

export async function listAll() {
  return col()
    .find({ tier: "tieu-nao" })
    .sort({ taskType: 1, priority: 1 })
    .toArray();
}

export async function getActiveModel(taskType) {
  return col().findOne(
    { tier: "tieu-nao", taskType, isActive: true },
    { sort: { priority: 1 } }
  );
}

export async function setActiveModel(taskType, modelName) {
  const now = new Date();
  await col().updateMany(
    { tier: "tieu-nao", taskType },
    { $set: { isActive: false, updatedAt: now } }
  );
  const res = await col().updateOne(
    { tier: "tieu-nao", taskType, name: modelName },
    { $set: { isActive: true, updatedAt: now } }
  );
  return res.modifiedCount > 0;
}

export async function deleteModel(taskType, name, provider) {
  const res = await col().deleteOne({
    tier: "tieu-nao",
    taskType,
    name,
    provider,
  });
  return res.deletedCount > 0;
}