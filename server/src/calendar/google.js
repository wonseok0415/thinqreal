// Google 캘린더 미러링 — CalendarApp 사용부를 googleapis(calendar v3)로 이식.
// 데이터 원본이 아닌 동기화용 엑스트라 (decisions §2-⑥). CALENDAR_ID 미설정 시 silent skip.
// 서비스 계정에 대상 캘린더 "변경 권한" 공유 필요.
// 표기 범위: 운영 정보만 — 방문자 명단·연락처(전화·이메일) 제외 (개인정보 노출 최소화, 변경 금지).
import { config, loadServiceAccount } from '../config.js';
import { SLOT_TIMES, SLOT_LABEL_TEXT } from '../lib/constants.js';
import { normalizeDate } from '../lib/dates.js';

let calendarApi = null;

// googleapis는 동적 import — CALENDAR_ID 미설정 배포(ST 등)에서 무거운 라이브러리를 로드하지
// 않아 K8s 메모리 limit(256Mi) 안에서 여유 확보 (store/index.js의 sheets 지연 로드와 동일 원칙).
async function getCalendarApi() {
  if (!config.calendarId) return null;
  if (calendarApi) return calendarApi;
  const sa = loadServiceAccount();
  if (!sa) {
    console.warn('[calendar] 서비스 계정 미설정 — 캘린더 동기화 skip');
    return null;
  }
  const { google } = await import('googleapis');
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  calendarApi = google.calendar({ version: 'v3', auth });
  return calendarApi;
}

// 회차 입력 정규화 — .gs normalizeSlotsInput 이식 (bookings 핸들러와 공유)
export function normalizeSlotsInput(slots, slot) {
  let arr = [];
  if (Array.isArray(slots)) arr = slots;
  else if (typeof slots === 'string' && slots) { try { arr = JSON.parse(slots); } catch { /* 무시 */ } }
  if (!arr.length && slot != null && slot !== '') arr = [slot];
  return arr.map((n) => Number(n)).filter((n) => !isNaN(n));
}

// calendarEventId 셀 파싱 — 신규(JSON 배열) + 레거시(단일 문자열) 모두 처리
export function parseEventIds(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') {
    try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; }
  }
  return [s];
}

// CalendarApp의 이벤트 id는 'xxx@google.com' 형식 — API v3는 @앞 부분만 사용 (레거시 호환)
function apiEventId(eid) {
  return String(eid).replace(/@google\.com$/, '');
}

// 예약 → 캘린더 이벤트 스펙 배열 (회차마다 1건 — 회차 사이 재정비·점심 공백 때문에 항상 분리)
export function buildCalendarEvents(b) {
  const slots = normalizeSlotsInput(b.slots, b.slot).sort((a, c) => a - c);
  if (!slots.length) return [];
  const dateStr = normalizeDate(b.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];

  const purpose = String(b.purpose || '').trim();
  const subject = String(b.subject || b.org || '').trim();
  const title = '[' + (purpose || 'ThinQ Real') + '] ' + (subject || '예약') + (b.name ? ' · ' + b.name : '');
  const location = '마곡 LG사이언스파크 W6동 1층';

  const hhmm = ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

  return slots.filter((n) => SLOT_TIMES[n]).map((n) => {
    const t = SLOT_TIMES[n];
    const lines = [];
    if (purpose) lines.push('목적: ' + purpose);
    if (subject) lines.push('주제: ' + subject);
    if (b.clientCompany) lines.push('고객사: ' + b.clientCompany);
    lines.push('회차: ' + (SLOT_LABEL_TEXT[n] || (n + '회차')));
    if (b.count !== '' && b.count != null) lines.push('인원: ' + b.count + '명');
    if (b.name) lines.push('책임자: ' + b.name);
    if (b.usagePlan) lines.push('', '활용 방안:', String(b.usagePlan));
    lines.push('', '— 상세는 관리자 페이지에서 확인', config.adminPageUrl);

    return {
      summary: title,
      location,
      description: lines.join('\n'),
      start: { dateTime: `${dateStr}T${hhmm(t.start)}`, timeZone: 'Asia/Seoul' },
      end: { dateTime: `${dateStr}T${hhmm(t.end)}`, timeZone: 'Asia/Seoul' },
    };
  });
}

async function safeDelete(api, eid) {
  try {
    await api.events.delete({ calendarId: config.calendarId, eventId: apiEventId(eid) });
  } catch (e) {
    console.warn('[calendar] delete skip (' + eid + '): ' + e.message);
  }
}

/** 확정 예약 등록/갱신 — delete+recreate, 생성 id 배열을 시트에 write-back */
export async function syncCalendarUpsert(store, id) {
  const api = await getCalendarApi();
  if (!api) return;
  const booking = await store.bookings.getById(id);
  if (!booking) return;

  for (const eid of parseEventIds(booking.calendarEventId)) await safeDelete(api, eid);

  const specs = buildCalendarEvents(booking);
  const newIds = [];
  try {
    for (const spec of specs) {
      const created = await api.events.insert({ calendarId: config.calendarId, requestBody: spec });
      newIds.push(created.data.id);
    }
  } catch (e) {
    console.warn('[calendar] upsert error: ' + e.message);
  }
  await store.bookings.update(id, { calendarEventId: newIds.length ? JSON.stringify(newIds) : '' });
}

/** 예약의 캘린더 이벤트 전부 제거 + eventId 비움 */
export async function syncCalendarDelete(store, id) {
  const api = await getCalendarApi();
  if (!api) return;
  const booking = await store.bookings.getById(id);
  if (!booking) return;
  const ids = parseEventIds(booking.calendarEventId);
  if (!ids.length) return;
  for (const eid of ids) await safeDelete(api, eid);
  await store.bookings.update(id, { calendarEventId: '' });
}

export async function syncCalendarByStatus(store, id, status) {
  if (String(status) === '확정') await syncCalendarUpsert(store, id);
  else await syncCalendarDelete(store, id);
}

/** GET ?type=calendar_test — 설정+쓰기 권한 점검 (테스트 일정 생성 후 즉시 삭제) */
export async function calendarTest() {
  if (!config.calendarId) {
    return { ok: false, reason: 'not_configured', hint: 'env CALENDAR_ID 미설정. 대상 캘린더 ID를 등록하세요.' };
  }
  const api = await getCalendarApi();
  if (!api) {
    return { ok: false, reason: 'no_access', calendarId: config.calendarId, hint: '서비스 계정 자격증명이 없거나 잘못되었습니다.' };
  }
  try {
    const meta = await api.calendars.get({ calendarId: config.calendarId });
    const now = Date.now();
    const ev = await api.events.insert({
      calendarId: config.calendarId,
      requestBody: {
        summary: '🧪 ThinQ Real 캘린더 연동 테스트 (자동 삭제됨)',
        description: '연동 점검용 임시 일정입니다. 자동으로 삭제됩니다.',
        start: { dateTime: new Date(now + 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now + 90 * 60 * 1000).toISOString() },
      },
    });
    await api.events.delete({ calendarId: config.calendarId, eventId: ev.data.id });
    return { ok: true, calendarId: config.calendarId, calendarName: meta.data.summary, testedEventId: ev.data.id };
  } catch (e) {
    return {
      ok: false, reason: 'write_failed', calendarId: config.calendarId,
      hint: '캘린더 접근 또는 일정 생성 실패. 서비스 계정에 "변경 권한"으로 공유했는지 확인하세요.',
      error: e.message,
    };
  }
}
