// 진단 엔드포인트 — mail_status / mail_test / telegram_test / teams_test / calendar_test
import { config } from '../config.js';
import { verifyAdminToken } from '../auth/token.js';
import { isAllowedAuthEmail } from '../auth/codes.js';
import { sendMail, mailMode } from '../mail/mailer.js';
import { sendTelegramMessage, telegramConfigured } from '../notify/telegram.js';
import { sendTeamsTest } from '../notify/teams.js';
import { calendarTest } from '../calendar/google.js';
import { formatDateTimeLocal } from '../lib/dates.js';

// MailApp 일일 할당량 개념이 없어 SMTP 설정 상태를 대신 보고 (계약상 remainingDailyQuota 키는 유지)
export function handleMailStatus() {
  return {
    success: true,
    adminEmails: config.adminAlertTo,
    ccEmail: config.adminAlertCc,
    remainingDailyQuota: null,
    quotaError: null,
    mailMode: mailMode(), // 'smtp' | 'console'
    smtpHost: config.smtp.host || '(미설정 — 콘솔 로그 모드)',
    smtpPort: config.smtp.port,
    ignoreTls: config.smtp.ignoreTls,
    from: config.smtp.from,
    replyTo: config.smtp.replyTo || null,
    forceSend: config.mailForceSend,
  };
}

/** 실발송이 일어나는 환경(OP, 또는 MAIL_FORCE_SEND 켠 ST)에서는 관리자 토큰 필수 — SSO 뒤라도 아무나 담당자에게 메일을 쏘지 못하게.
 *  `to`(선택): 단일 @lge.com 주소로만 발송(CC 없음) — 첫 SMTP 실측을 담당자 3인에게 뿌리지 않고 본인 수신으로 확인. */
export async function handleMailTest(q = {}) {
  const realSend = !config.outboundSuppressed || config.mailForceSend;
  if (realSend) {
    const admin = verifyAdminToken(q.token);
    if (!admin.ok) return { success: false, error: 'unauthorized', reason: admin.reason || 'invalid_token' };
  }
  let to = config.adminAlertTo;
  let cc = config.adminAlertCc;
  if (q.to) {
    const one = String(q.to).trim().toLowerCase();
    if (!isAllowedAuthEmail(one)) return { success: false, error: 'invalid_to', hint: 'to는 @lge.com 단일 주소만 허용' };
    to = one;
    cc = undefined;
  }
  const subject = '[ThinQ Real] 메일 발송 테스트';
  const body = '이 메일이 도착했다면 알림 시스템이 정상 동작 중입니다.\n\n발송 시각: ' + new Date().toISOString()
    + `\n환경: ${config.environment || 'local'} / 발신: ${config.smtp.from}` + (config.smtp.replyTo ? ` / 회신: ${config.smtp.replyTo}` : '');
  const result = await sendMail({ to, cc, subject, text: body });
  if (result.ok) {
    return {
      success: true, message: '테스트 메일을 발송했습니다.', sentTo: to, cc: cc || null, mailMode: result.mode,
      from: config.smtp.from, accepted: result.accepted, rejected: result.rejected, response: result.response,
    };
  }
  return { success: false, error: result.error, mailMode: result.mode, hint: 'SMTP 설정(env SMTP_HOST/PORT/SMTP_IGNORE_TLS/MAIL_FROM)을 확인해 주세요.' };
}

export async function handleTelegramTest() {
  if (!telegramConfigured()) {
    return { ok: false, reason: 'not_configured', hint: 'env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 확인' };
  }
  return sendTelegramMessage('🧪 <b>ThinQ Real 텔레그램 연동 테스트</b>\n' + formatDateTimeLocal(new Date()));
}

export async function handleTeamsTest() {
  return sendTeamsTest();
}

export async function handleCalendarTest() {
  return calendarTest();
}

// 사내 컨테이너 → 인터넷 아웃바운드 진단 (2026-09-17). 하이브리드 에지 설계(외부 접점은 현행
// Apps Script, 사내가 주기적으로 pull)의 성립 조건이 "pod가 script.google.com에 나갈 수 있는가"라서
// 관리자 토큰으로 실측한다. 대상은 현행 Apps Script의 공개 GET(appliances) — 실제 pull 경로와 동일 호스트.
// Node fetch는 HTTP(S)_PROXY env를 자동으로 쓰지 않으므로, 실패 시 proxyEnv 값이 다음 판단 근거가 된다.
export async function handleEgressCheck(token) {
  // ST/QA(발송 억제 환경)는 SSO 뒤라 토큰 없이 허용 — 담당자가 브라우저 주소창으로 바로 실측. OP는 관리자 토큰 필수.
  if (!config.outboundSuppressed) {
    const admin = verifyAdminToken(token);
    if (!admin.ok) return { error: 'unauthorized', reason: admin.reason || 'invalid_token' };
  }
  const url = config.legacyScriptUrl + '?type=appliances';
  const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || '';
  const started = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    let count = null;
    try { count = JSON.parse(text).count ?? null; } catch { /* HTML 등 — 상태만 보고 */ }
    return { ok: r.ok, status: r.status, ms: Date.now() - started, count, proxyEnv: proxyEnv ? 'set' : 'none' };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e?.cause?.code || e?.name || e?.message), proxyEnv: proxyEnv ? 'set' : 'none' };
  }
}
