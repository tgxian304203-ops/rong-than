async function xoayKeyVaModel({
  userId,
  conversationId,
  models,
  messages,
  temperature,
  maxTokens,
  signal,
}) {
  const errors = [];
  
  // Lấy tất cả key của user để dùng chung (tối ưu hiệu năng)
  const allKeys = {};
  for (const m of models) {
    if (!allKeys[m.provider]) {
      allKeys[m.provider] = await listKeysByProvider(userId, m.provider);
    }
  }

  // Duyệt từng model theo ĐÚNG thứ tự priority (1, 2, 3...)
  for (const model of models) {
    const provider = model.provider;
    const mod = MODULES[provider];
    if (!mod) continue;

    const keys = allKeys[provider] || [];
    if (keys.length === 0) continue;

    // Xoay từng KEY của provider này
    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const key = keys[keyIdx];
      if (key.quota === "out") continue;

      await logInfo(`Đại Não: thử key #${keyIdx + 1} × model ${model.name}`, {
        userId, conversationId, provider, model: model.name,
      });

      try {
        const res = await mod.chat({
          rawKey: key.rawKey,
          model: model.name,
          messages,
          temperature,
          maxTokens,
          signal,
        });

        if (res.ok && res.text) {
          await baoCaoConDung(model.name, provider);
          const session = await createSession({
            userId, conversationId, modelName: model.name,
            provider, keyId: String(key._id),
          });
          await logInfo("Đại Não: BOSS THÀNH CÔNG", {
            userId, conversationId, model: model.name, provider, keyIdx: keyIdx + 1,
          });
          return {
            ok: true, text: res.text, usage: res.usage, session,
            boss: { name: model.name, provider }, keyId: String(key._id),
          };
        }
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        const errText = err?.message || "Lỗi không rõ";

        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate") || msg.includes("exceeded")) {
          await updateQuota(key._id, "out");
          await baoCaoHetQuota(model.name, provider);
          await logWarn(`Đại Não: key #${keyIdx + 1} hết quota`, { userId, keyId: String(key._id) });
          errors.push(`key#${keyIdx + 1}: quota`);
          break; // Chuyển sang key tiếp theo
        }

        if (msg.includes("invalid") || msg.includes("401") || msg.includes("403")) {
          await updateQuota(key._id, "out");
          await logWarn(`Đại Não: key #${keyIdx + 1} không hợp lệ`, { userId, keyId: String(key._id) });
          errors.push(`key#${keyIdx + 1}: invalid`);
          break; // Chuyển sang key tiếp theo
        }

        // Lỗi khác -> Thử model tiếp theo trong danh sách priority
        await baoCaoLoi(model.name, provider, errText);
        await logWarn(`Đại Não: model lỗi → thử model tiếp`, { userId, model: model.name, error: errText });
        errors.push(`${model.name}: ${errText}`);
      }
    }
  }

  return { ok: false, error: errors.slice(0, 5).join(" | ") || "Không gọi được BOSS" };
}