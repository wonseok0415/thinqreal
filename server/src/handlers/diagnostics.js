// 진단 엔드포인트 — mail_status / mail_test / telegram_test / teams_test / calendar_test
import { config } from '../config.js';
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
  };
}

export async function handleMailTest() {
  const subject = '[ThinQ Real] 메일 발송 테스트';
  const body = '이 메일이 도착했다면 알림 시스템이 정상 동작 중입니다.\n\n발송 시각: ' + new Date().toISOString();
  const result = await sendMail({ to: config.adminAlertTo, cc: config.adminAlertCc, subject, text: body });
  if (result.ok) {
    return { success: true, message: '테스트 메일을 발송했습니다.', sentTo: config.adminAlertTo, cc: config.adminAlertCc, mailMode: result.mode };
  }
  return { success: false, error: result.error, hint: 'SMTP 설정(env SMTP_HOST/PORT/USER/PASS)을 확인해 주세요.' };
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
