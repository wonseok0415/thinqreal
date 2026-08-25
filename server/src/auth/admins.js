// 관리자 명단 판별 — AUTH_ADMIN_EMAILS(영구) + AUTH_TEMP_ADMINS(만료일 기반 임시)
import { AUTH_ADMIN_EMAILS, AUTH_TEMP_ADMINS } from '../lib/constants.js';

// 임시 관리자 활성 여부 — 등록되어 있고 KST 만료일 23:59:59 이전이면 true.
// 만료일 파싱은 반드시 '+09:00' 명시 (다른 TZ 해석 방지 — 현행 규칙 유지)
export function isTempAdminActive(email) {
  if (!email) return false;
  const key = String(email).trim().toLowerCase();
  const expiry = AUTH_TEMP_ADMINS[key];
  if (!expiry) return false;
  const expiryTs = new Date(expiry + 'T23:59:59+09:00').getTime();
  return Date.now() <= expiryTs;
}

export function isAdminEmail(email) {
  if (!email) return false;
  const s = String(email).trim().toLowerCase();
  if (AUTH_ADMIN_EMAILS.map((x) => x.toLowerCase()).includes(s)) return true;
  return isTempAdminActive(s);
}
