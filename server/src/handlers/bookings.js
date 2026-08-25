// 예약 핸들러 — .gs handleGetBookings/handleNewBooking/handleUpdateStatus/
// handleDeleteBooking/handleAdminCreateBooking/handleAdminEditBooking 이식.
import { BOOKING_HEADERS } from '../lib/constants.js';
import { verifyAdminToken } from '../auth/token.js';
import { sendMail } from '../mail/mailer.js';
import { buildAdminAlertText, buildAdminAlertHtml } from '../mail/templates/adminAlert.js';
import { buildConfirmText, buildConfirmHtml, buildRejectText, buildRejectHtml } from '../mail/templates/confirm.js';
import { notifyNewBooking, notifyStatusChange } from '../notify/index.js';
import { normalizeSlotsInput, syncCalendarUpsert, syncCalendarDelete, syncCalendarByStatus } from '../calendar/google.js';
import { config } from '../config.js';

// ── 전체 예약 목록 (관리자) — 개인정보 포함이라 토큰 필수 ──
export async function handleGetBookings(store, token) {
  const admin = verifyAdminToken(token);
  if (!admin.ok) return { error: 'unauthorized', reason: admin.reason || 'invalid_token' };
  const records = await store.bookings.listAll();
  return { records };
}

// ── 신규 예약 저장 + 담당자 알림 (메일·메신저) ──
export async function handleNewBooking(store, data) {
  const id = String(Date.now());
  const record = {};
  for (const h of BOOKING_HEADERS) {
    if (h === 'id') record[h] = id;
    else if (h === 'slots') record[h] = JSON.stringify(data.slots || [data.slot]);
    else if (h === 'timestamp') record[h] = data.timestamp || new Date().toISOString();
    else record[h] = data[h] ?? '';
  }
  await store.bookings.append(record);

  await sendAdminAlert(data, id);
  await notifyNewBooking(data, id);

  return { success: true, id };
}

async function sendAdminAlert(data, id) {
  const subject = `[ThinQ Real] 새 예약 신청 — ${data.date} ${data.slotLabel || ''}`;
  await sendMail({
    to: config.adminAlertTo,
    cc: config.adminAlertCc,
    subject,
    text: buildAdminAlertText(data, id),
    html: buildAdminAlertHtml(data, id),
  });
}

// 예약자 확정/거절 메일 — HTML + plain-text 동시
async function sendGuestMail(data) {
  const isConfirmed = data.status === '확정';
  const subject = isConfirmed
    ? `[ThinQ Real] 예약이 확정되었습니다 — ${data.date} ${data.slotLabel || ''}`
    : `[ThinQ Real] 예약 신청이 거절되었습니다`;
  await sendMail({
    to: data.email,
    cc: config.adminAlertCc,
    subject,
    text: isConfirmed ? buildConfirmText(data) : buildRejectText(data),
    html: isConfirmed ? buildConfirmHtml(data) : buildRejectHtml(data),
  });
}

// ── 상태 업데이트 (확정/거절) — 예약자 메일 + 메신저 + 캘린더 동기화 ──
export async function handleUpdateStatus(store, data) {
  const booking = await store.bookings.getById(data.id);
  if (!booking) return { error: 'Record not found' };

  await store.bookings.update(data.id, { status: data.status });

  // 목적은 시트에서 읽은 값을 우선 사용 (현행 동일)
  if (data.email) {
    await sendGuestMail({ ...data, purpose: data.purpose || booking.purpose || '' });
  }
  await notifyStatusChange({ ...booking, status: data.status }, data.status);
  await syncCalendarByStatus(store, data.id, data.status);

  return { success: true };
}

// ── 영구 삭제 — 메일 미발송 (의도: 테스트·실수 데이터 정리). 캘린더 이벤트 먼저 제거 ──
export async function handleDeleteBooking(store, data, byEmail) {
  await syncCalendarDelete(store, data.id);
  const removed = await store.bookings.remove(data.id);
  if (!removed) return { error: 'Record not found' };
  console.log(`[bookings] deleted ${data.id} by ${byEmail}`);
  return { success: true };
}

// ── 관리자 직접 입력 (이력 백필) — 알림 미발송 (의도) ──
export async function handleAdminCreateBooking(store, data, byEmail) {
  // id는 클라이언트 값 우선(낙관적 UI와 동일 id 유지) → 없으면 서버 생성
  const id = data.id ? String(data.id) : String(Date.now());
  const slots = normalizeSlotsInput(data.slots, data.slot);

  const record = {};
  for (const h of BOOKING_HEADERS) {
    if (h === 'id') record[h] = id;
    else if (h === 'timestamp') record[h] = data.timestamp || new Date().toISOString();
    else if (h === 'slots') record[h] = JSON.stringify(slots);
    else if (h === 'slot') record[h] = slots.length ? slots[0] : (data.slot ?? '');
    else if (h === 'status') record[h] = data.status || '확정';
    else record[h] = data[h] ?? '';
  }
  await store.bookings.append(record);

  if ((data.status || '확정') === '확정') await syncCalendarUpsert(store, id);
  console.log(`[bookings] admin created ${id} by ${byEmail} (no notification)`);
  return { success: true, id };
}

// ── 관리자 상세 수정 — 편집 가능 필드만, id·timestamp·privacyConsent 보존. 알림 미발송 ──
const EDITABLE_FIELDS = [
  'date', 'slotLabel', 'name', 'org', 'phone', 'email', 'purpose', 'count', 'note', 'status',
  'subject', 'clientCompany', 'visitors', 'usagePlan', 'expectedEffect', 'purposeKey',
  'division', 'department',
];

export async function handleAdminEditBooking(store, data, byEmail) {
  const booking = await store.bookings.getById(data.id);
  if (!booking) return { error: 'Record not found' };

  const fields = {};
  if (data.slots !== undefined || data.slot !== undefined) {
    const slots = normalizeSlotsInput(data.slots, data.slot);
    if (slots.length) {
      fields.slots = JSON.stringify(slots);
      fields.slot = slots[0];
    }
  }
  for (const f of EDITABLE_FIELDS) {
    if (data[f] !== undefined) fields[f] = data[f];
  }

  const after = await store.bookings.update(data.id, fields);
  if (after) await syncCalendarByStatus(store, data.id, after.status);

  console.log(`[bookings] admin edited ${data.id} by ${byEmail} (no notification)`);
  return { success: true };
}
