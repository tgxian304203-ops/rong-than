// server/dai-nao/kiem-tra-quota.js
// Nhiệm vụ: Kiểm tra quota key Đại Não.
// Auto-reset quota "out" → "ok" sau 1 giờ.

import { get as getQuota, setQuota } from "../db/quotaState.js";

export async function layQuota(keyId) {
  const doc = await getQuota("dai-nao", keyId);
  if (!doc) return "ok";
  return doc.quota === "out" ? "out" : "ok";
}

export async function datConQuota(keyId) {
  return setQuota({ tier: "dai-nao", keyId, quota: "ok" });
}

export async function datHetQuota(keyId, note = "") {
  return setQuota({ tier: "dai-nao", keyId, quota: "out", note });
}

export default {
  layQuota,
  datConQuota,
  datHetQuota,
};