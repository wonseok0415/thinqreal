// HMAC-SHA256 서명 토큰 — 형식 불변: base64url(payload).base64url(signature)
// payload = { email, exp, admin }. 현행 AUTH_SECRET 값을 그대로 옮기면 기존 발급 토큰이 계속 유효.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { isAdminEmail } from './admins.js';

export function signAuthToken(email, exp, isAdmin) {
  const payload = JSON.stringify({ email, exp, admin: !!isAdmin });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sigB64 = crypto.createHmac('sha256', config.authSecret).update(payloadB64).digest('base64url');
  return payloadB64 + '.' + sigB64;
}

function constantTimeEquals(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** 서명·만료 검증. 유효하면 {ok:true, email, admin}, 아니면 {ok:false, reason} */
export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) {
    return { ok: false, reason: 'no_token' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payloadB64, sigB64] = parts;

  const expected = crypto.createHmac('sha256', config.authSecret).update(payloadB64).digest('base64url');
  if (!constantTimeEquals(expected, sigB64)) return { ok: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (!payload || !payload.exp || Number(payload.exp) <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, email: String(payload.email || '').toLowerCase(), admin: !!payload.admin };
}

/** 관리자 토큰 — 서명 유효 + admin 플래그 + (영구 명단 OR 활성 임시) 모두 만족해야 통과.
 *  모든 파괴적 작업의 진짜 방어선 (클라이언트 게이트는 편의) — 임의로 약화하지 말 것. */
export function verifyAdminToken(token) {
  const v = verifyAuthToken(token);
  if (!v.ok) return v;
  if (!v.admin) return { ok: false, reason: 'not_admin' };
  if (!isAdminEmail(v.email)) return { ok: false, reason: 'not_in_allowlist' };
  return { ok: true, email: v.email };
}
