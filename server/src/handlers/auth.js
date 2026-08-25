// 인증 핸들러 — 메인 게이트(@lge.com 전체) + 관리자(명단 한정), 코드 발급/검증/토큰.
// .gs handleAuthRequest/handleAuthVerify/handleAdminAuthRequest/handleAdminAuthVerify 이식.
// 현행 HMAC 토큰 구조 유지 — SSO 헤더 방식은 요구사항 확인 후 이 모듈만 교체 (설계 §5).
import { AUTH_CODE_TTL_SEC, AUTH_TOKEN_TTL_DAYS, AUTH_ADMIN_TOKEN_TTL_DAYS } from '../lib/constants.js';
import { isAllowedAuthEmail, issueCode, verifyCode } from '../auth/codes.js';
import { isAdminEmail } from '../auth/admins.js';
import { signAuthToken } from '../auth/token.js';
import { sendMail } from '../mail/mailer.js';
import { buildAuthCodeText, buildAuthCodeHtml } from '../mail/templates/authCode.js';

async function sendCodeMail(email, code, isAdmin) {
  return sendMail({
    to: email,
    subject: isAdmin ? '[ThinQ Real] 관리자 페이지 인증 코드' : '[ThinQ Real] 사이트 접속 인증 코드',
    text: buildAuthCodeText(code),
    html: buildAuthCodeHtml(code),
  });
}

export async function handleAuthRequest(email) {
  email = (email || '').trim().toLowerCase();
  if (!isAllowedAuthEmail(email)) {
    return { ok: false, error: 'invalid_email', message: 'LG 임직원 메일(@lge.com)만 입력 가능합니다.' };
  }
  const code = await issueCode(email, 'auth');
  if (!code) return { ok: false, error: 'cooldown', message: '잠시 후 다시 시도해 주세요. (60초)' };

  const sent = await sendCodeMail(email, code, false);
  if (!sent.ok) return { ok: false, error: 'mail_failed', message: '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  return { ok: true, ttl: AUTH_CODE_TTL_SEC };
}

export async function handleAuthVerify(email, code) {
  email = (email || '').trim().toLowerCase();
  code = (code || '').trim();
  if (!isAllowedAuthEmail(email)) return { ok: false, error: 'invalid_email' };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'invalid_code', message: '인증 코드는 6자리 숫자입니다.' };

  const v = await verifyCode(email, code, 'auth');
  if (!v.ok) return v;

  const exp = Date.now() + AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  return { ok: true, token: signAuthToken(email, exp), email, exp };
}

export async function handleAdminAuthRequest(email) {
  email = (email || '').trim().toLowerCase();
  if (!isAdminEmail(email)) {
    return { ok: false, error: 'not_admin', message: '관리자 권한이 없는 계정입니다. 운영 담당자에게 문의해 주세요.' };
  }
  const code = await issueCode(email, 'admin');
  if (!code) return { ok: false, error: 'cooldown', message: '잠시 후 다시 시도해 주세요. (60초)' };

  const sent = await sendCodeMail(email, code, true);
  if (!sent.ok) return { ok: false, error: 'mail_failed', message: '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  return { ok: true, ttl: AUTH_CODE_TTL_SEC };
}

export async function handleAdminAuthVerify(email, code) {
  email = (email || '').trim().toLowerCase();
  code = (code || '').trim();
  if (!isAdminEmail(email)) return { ok: false, error: 'not_admin' };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'invalid_code', message: '인증 코드는 6자리 숫자입니다.' };

  const v = await verifyCode(email, code, 'admin');
  if (!v.ok) return v;

  const exp = Date.now() + AUTH_ADMIN_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  return { ok: true, token: signAuthToken(email, exp, true), email, exp };
}
