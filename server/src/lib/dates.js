// 날짜 유틸 — 전부 KST(프로세스 TZ=Asia/Seoul) 로컬 시간 기준.
// toISOString()으로 날짜 문자열을 만들지 말 것 (UTC 변환으로 하루 밀림 — 2026-05-25 버그).

const pad2 = (n) => String(n).padStart(2, '0');

/** 로컬(KST) 기준 YYYY-MM-DD */
export function formatDateLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 로컬(KST) 기준 YYYY-MM */
export function formatMonthLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * 날짜 값을 YYYY-MM-DD 문자열로 정규화.
 * Date 객체 / ISO 문자열 / 'YYYY-MM-DD' / Sheets 표시 포맷("2026. 5. 26.") 모두 처리.
 */
export function normalizeDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return formatDateLocal(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Sheets 한국 로케일 표시 포맷 대응: 2026. 5. 26 / 2026.5.26. / 2026/5/26
  const m = s.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  if (s.indexOf('T') >= 0) return s.slice(0, 10);
  return s.slice(0, 10);
}

/** 월 값을 YYYY-MM으로 정규화 (Date/문자열 모두) */
export function normalizeMonth(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return formatMonthLocal(v);
  const d = normalizeDate(v);
  return d ? d.slice(0, 7) : String(v).slice(0, 7);
}

export function formatPublishedDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return formatDateLocal(v);
  return normalizeDate(v) || String(v).slice(0, 10);
}

/** 로컬(KST) 기준 오늘이 이번 달의 마지막 금요일인지 (구 발송 기준 — 2026-07-29부로 미사용) */
export function isLastFridayOfMonth(d) {
  if (d.getDay() !== 5) return false; // 5 = Friday
  const next = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
  return next.getMonth() !== d.getMonth();
}

/** 로컬(KST) 기준 오늘이 이번 달의 첫째 수요일인지 (2026-07-29 — 월간 리포트는 첫째 수요일에 전월분 발송) */
export function isFirstWednesdayOfMonth(d) {
  return d.getDay() === 3 && d.getDate() <= 7; // 3 = Wednesday, 1~7일 사이
}

/** 전월 yyyy-MM (로컬 KST) */
export function prevMonthLocal(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1;
  return (m === 1 ? y - 1 : y) + '-' + pad2(m === 1 ? 12 : m - 1);
}

/** 'YYYY-MM-DD HH:mm:ss' (KST) — 로그·텔레그램 스탬프용 */
export function formatDateTimeLocal(d) {
  return `${formatDateLocal(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
