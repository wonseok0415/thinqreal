// 진단 엔드포인트 — mail_status / mail_test / telegram_test / teams_test / calendar_test
import { config } from '../config.js';
import { verifyAdminToken } from '../auth/token.js';
import { isAllowedAuthEmail } from '../auth/codes.js';
import { sendMail, mailMode } from '../mail/mailer.js';
import { sendTelegramMessage, telegramConfigured } from '../notify/telegram.js';
import { sendTeamsTest } from '../notify/teams.js';
import { calendarTest } from '../calendar/google.js';
import { formatDateTimeLocal } from '../lib/dates.js';
import os from 'node:os';
import net from 'node:net';

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
/** pod에 주입된 환경변수 **이름만** 나열(값은 절대 반환하지 않음) — "어느 configmap/secret이 이 환경에 도달했는가" 판별용
 *  (2026-09-28 OP SMTP env 미반영 진단: 릴리스는 롤아웃됐는데 main의 configmap 수정이 OP pod에 없었음).
 *  OP는 관리자 토큰 필수, ST/QA는 SSO 뒤라 생략 허용(egress_check와 동일 규칙). */
export function handleEnvKeys(token) {
  if (!config.outboundSuppressed) {
    const admin = verifyAdminToken(token);
    if (!admin.ok) return { ok: false, error: 'unauthorized', reason: admin.reason || 'invalid_token' };
  }
  const names = Object.keys(process.env).sort();
  const has = (p) => names.some((n) => n.startsWith(p));
  return {
    ok: true,
    environment: config.environment || 'local',
    pod: os.hostname(),
    count: names.length,
    groups: { // 주입 경로별 도달 여부 요약 — base configmap(KVSTORE_*), 환경 secret(DB_*), 환경 configmap(SMTP_*/MAIL_*), 앱 설정(AUTH_SECRET 등)
      kvstore: has('KVSTORE_'), db: has('DB_'), smtp: has('SMTP_') || has('MAIL_'), authSecret: names.includes('AUTH_SECRET'),
      legacyAuthSecret: names.includes('LEGACY_AUTH_SECRET'), environment: names.includes('ENVIRONMENT'),
    },
    names, // 값 없음 — 이름만
  };
}

// ── db_probe (키트 v4.12, 2026-09-29) — pod → RDS·valkey TCP 도달 진단 ──
// 목적: DB계정(Next Spoc) 절차의 SG 허용이 실제로 pod에 적용됐는지를 cert·secret 없이 확인한다.
// 연결만 열고 닫는다(인증 없음). 값이 없어도 되므로 configmap·secret 변경 없이 주소창으로 실측 가능.
// 대상: host&port 지정(AWS 엔드포인트 접미사만 허용 — 임의 호스트 스캔 방지) 또는 미지정 시 현재 env의 DB_HOST:DB_PORT·KVSTORE_ADDR.
// 응답의 host는 마스킹(마지막 4레이블만) — 담당자가 결과 JSON을 외부 채팅에 붙여도 인스턴스명이 새지 않게.
const PROBE_HOST_ALLOW = /\.amazonaws\.com$/i;
const PROBE_TIMEOUT_MS = 5000;
const PROBE_HINTS = {
  ETIMEDOUT: 'SG 미허용 또는 접속 IP 대역 불일치 유력(패킷이 버려짐) — Next Spoc SG 허용 결과 확인',
  ECONNREFUSED: '호스트에는 도달, 포트가 닫힘 — 포트 번호 확인',
  ENOTFOUND: 'DNS 실패 — 엔드포인트 이름 오타 또는 이 VPC에서 해석 불가',
  EAI_AGAIN: 'DNS 일시 실패 — 재시도',
  EHOSTUNREACH: '라우팅 없음 — VPC·서브넷 연결 확인',
  ENETUNREACH: '라우팅 없음 — VPC·서브넷 연결 확인',
};

function maskHost(host) {
  const labels = String(host).split('.');
  return labels.length > 4 ? '….' + labels.slice(-4).join('.') : host;
}

function parseKvAddr(addr) {
  if (!addr) return null;
  let s = String(addr).replace(/^rediss?:\/\//i, '');
  const at = s.lastIndexOf('@'); // user:pass@host:port 형태면 자격은 버림
  if (at >= 0) s = s.slice(at + 1);
  const m = /^\[?([^\]/]+?)\]?(?::(\d+))?(?:\/.*)?$/.exec(s);
  if (!m) return null;
  return { host: m[1], port: Number(m[2] || 6379) };
}

function probeTcp(t) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    const finish = (r) => { if (done) return; done = true; sock.destroy(); resolve({ ...t, host: maskHost(t.host), ...r, ms: Date.now() - started }); };
    const sock = net.connect({ host: t.host, port: t.port });
    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.on('connect', () => finish({ ok: true }));
    sock.on('timeout', () => finish({ ok: false, error: 'ETIMEDOUT', hint: PROBE_HINTS.ETIMEDOUT }));
    sock.on('error', (e) => { const code = e?.code || 'ERROR'; finish({ ok: false, error: code, hint: PROBE_HINTS[code] || String(e?.message || e) }); });
  });
}

export async function handleDbProbe(q) {
  if (!config.outboundSuppressed) { // OP는 관리자 토큰 필수, ST/QA는 SSO 뒤라 생략 허용 (egress_check와 동일 규칙)
    const admin = verifyAdminToken(q.token);
    if (!admin.ok) return { error: 'unauthorized', reason: admin.reason || 'invalid_token' };
  }
  const targets = [];
  if (q.host) {
    const host = String(q.host).trim().toLowerCase().replace(/^[<"'`]+|[>"'`]+$/g, '');
    const port = Number(String(q.port || '').trim());
    if (!PROBE_HOST_ALLOW.test(host)) return { ok: false, error: 'host_not_allowed', hint: 'amazonaws.com 엔드포인트만 허용' };
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'bad_port', hint: 'port=5432 또는 6379' };
    targets.push({ target: 'custom', host, port, clusterCfg: /^clustercfg\./.test(host) });
  } else {
    if (config.db.host) targets.push({ target: 'db', host: config.db.host, port: config.db.port });
    const kv = parseKvAddr(config.kvstore.addr);
    if (kv) targets.push({ target: 'kvstore', ...kv, clusterCfg: /^clustercfg\./i.test(kv.host) });
  }
  if (!targets.length) return { ok: false, error: 'no_target', hint: 'host=&port= 지정 또는 DB_HOST/KVSTORE_ADDR env 필요' };
  const results = await Promise.all(targets.map(probeTcp));
  return { ok: results.every((r) => r.ok), pod: os.hostname(), env: config.environment || 'local', results };
}

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
