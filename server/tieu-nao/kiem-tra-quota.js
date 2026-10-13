// server/tieu-nao/kiem-tra-quota.js
// Nhiệm vụ: Kiểm tra quota key Tiểu Não.

import { get as getQuota, setQuota } from "../db/quotaState.js";

export async function layQuota(keyId) {
  const doc = await getQuota("tieu-nao", keyId);
  if (!doc) return "ok";
  return doc.quota === "out" ? "out" : "ok";
}

export async function datConQuota(keyId) {
  return setQuota({ tier: "tieu-nao", keyId, quota: "ok" });
}

export async function datHetQuota(keyId, note = "") {
  return setQuota({ tier: "tieu-nao", keyId, quota: "out", note });
}

export default {
  layQuota,
  datConQuota,
  datHetQuota,
};