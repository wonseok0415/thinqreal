// 가용성 조회 — 확정만 마감, 대기중은 회차별 건수(N팀 예약 중), 차단 슬롯 합류.
// 응답 스키마 { bookedSlots, pendingCounts, blockedSlots } 변경 금지 (메인 페이지 캐시 호환).
import { normalizeSlotsInput } from '../calendar/google.js';

export async function handleAvailability(store, date) {
  if (!date) return { bookedSlots: [], pendingCounts: {}, blockedSlots: [] };

  const rows = await store.bookings.listByDate(date);
  const booked = new Set();
  const pendingCounts = {};

  for (const row of rows) {
    const status = row.status;
    if (status !== '확정' && status !== '대기중') continue;
    const slots = normalizeSlotsInput(row.slots, row.slot);
    for (const n of slots) {
      if (status === '확정') booked.add(n);
      else pendingCounts[n] = (pendingCounts[n] || 0) + 1;
    }
  }

  let blocked = [];
  try {
    blocked = (await store.slotBlocks.list(date)).map((b) => Number(b.slot));
  } catch { /* slot_blocks 미생성 등은 무시 — 현행 동일 */ }

  return { bookedSlots: [...booked], pendingCounts, blockedSlots: blocked };
}
