// 슬롯 제어 — .gs handleGetSlotBlocks/handleSlotBlock/handleSlotUnblock 이식.
// 차단 현황 조회는 비민감(GET 무토큰), 차단/해제는 관리자 토큰 게이트(routes/post.js).
import { normalizeDate } from '../lib/dates.js';

export async function handleGetSlotBlocks(store, date) {
  const rows = await store.slotBlocks.list(date);
  const blocks = rows.map((r) => ({
    id: String(r.id || ''),
    date: normalizeDate(r.date),
    slot: Number(r.slot),
    by: String(r.by || ''),
    reason: String(r.reason || ''),
    timestamp: r.timestamp ? String(r.timestamp) : '',
  }));
  return { blocks };
}

// 이미 같은 date+slot 차단이 있으면 중복 없이 무시 (현행 동일)
export async function handleSlotBlock(store, data, byEmail) {
  const date = normalizeDate(data.date);
  const slot = Number(data.slot);
  if (!date || !(slot >= 1 && slot <= 3)) return { error: 'invalid_params' };

  const existing = await store.slotBlocks.list(date);
  if (existing.some((r) => Number(r.slot) === slot)) return { success: true, duplicate: true };

  await store.slotBlocks.add({
    id: String(Date.now()),
    date,
    slot,
    timestamp: new Date().toISOString(),
    by: byEmail || '',
    reason: data.reason || '',
  });
  return { success: true };
}

export async function handleSlotUnblock(store, data) {
  let removed = 0;
  if (data.id) {
    removed = await store.slotBlocks.removeById(data.id);
  } else if (data.date && data.slot != null) {
    removed = await store.slotBlocks.removeByDateSlot(data.date, data.slot);
  }
  return { success: removed > 0, removed };
}
