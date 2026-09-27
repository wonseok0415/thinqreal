// SMTP 전송 래퍼 — MailApp 대체. 발신 표시명 'ThinQ Real' 통일 (모든 ThinQ Real 발신 메일 공통).
// SMTP_HOST 미설정 시 콘솔 로그 트랜스포트(로컬 검증용) — 실제 발송 없이 성공 처리 + 본문 로그.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;
let mode = null; // 'smtp' | 'console'

function getTransporter() {
  if (transporter) return transporter;
  if (config.outboundSuppressed && !config.mailForceSend) {
    // 비운영 환경(kic-st/kic-qa) — 실발송 억제, 본문은 콘솔(LENS 로그)로만 (config.outboundSuppressed)
    mode = 'console';
    transporter = nodemailer.createTransport({ jsonTransport: true });
    console.warn(`[mail] ENVIRONMENT=${config.environment} 비운영 환경 → 메일 실발송 억제 (콘솔 모드, MAIL_FORCE_SEND=true 또는 OUTBOUND_FORCE_SEND=true로 해제)`);
  } else if (config.smtp.host) {
    mode = 'smtp';
    if (config.outboundSuppressed) console.warn(`[mail] ENVIRONMENT=${config.environment} MAIL_FORCE_SEND=true → 메일만 실발송 (SMTP 테스트 창구)`);
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      ignoreTLS: config.smtp.ignoreTls, // 사내 릴레이(25/무인증)는 평문 세션 — 가이드 샘플과 동일
      tls: { rejectUnauthorized: config.smtp.rejectUnauthorized },
      name: config.smtp.ehloName || undefined,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
    });
  } else {
    mode = 'console';
    transporter = nodemailer.createTransport({ jsonTransport: true });
    console.warn('[mail] SMTP_HOST 미설정 → 콘솔 로그 모드 (실제 발송 없음, 로컬 검증용)');
  }
  return transporter;
}

export function mailMode() {
  getTransporter();
  return mode;
}

/**
 * @param {{to:string, cc?:string, bcc?:string, subject:string, text:string, html?:string, attachments?:object[]}} msg
 * @returns {Promise<{ok:boolean, mode:string, error?:string, accepted?:string[], rejected?:string[], response?:string}>}
 */
export async function sendMail(msg) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: { name: 'ThinQ Real', address: config.smtp.from },
      replyTo: config.smtp.replyTo || undefined,
      to: msg.to,
      cc: msg.cc || undefined,
      bcc: msg.bcc || undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html || undefined,
      attachments: msg.attachments || undefined,
    });
    if (mode === 'console') {
      const parsed = JSON.parse(info.message);
      console.log(`[mail:console] to=${msg.to} subject="${msg.subject}"`);
      if (parsed.text) console.log('[mail:console] text:\n' + String(parsed.text).slice(0, 800));
    } else {
      // 릴레이 응답을 남긴다 — 가이드의 refused_recipients 확인과 같은 목적 (rejected가 비어야 접수 완료)
      console.log(`[mail] sent → ${msg.to} subject="${msg.subject}" accepted=${(info.accepted || []).length} rejected=${(info.rejected || []).length} response="${info.response || ''}"`);
      return { ok: true, mode, accepted: info.accepted, rejected: info.rejected, response: info.response };
    }
    return { ok: true, mode };
  } catch (e) {
    console.error('[mail] send error: ' + e.message);
    return { ok: false, mode, error: e.message };
  }
}
