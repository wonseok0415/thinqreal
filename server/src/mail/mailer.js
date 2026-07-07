// SMTP 전송 래퍼 — MailApp 대체. 발신 표시명 'ThinQ Real' 통일 (모든 ThinQ Real 발신 메일 공통).
// SMTP_HOST 미설정 시 콘솔 로그 트랜스포트(로컬 검증용) — 실제 발송 없이 성공 처리 + 본문 로그.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;
let mode = null; // 'smtp' | 'console'

function getTransporter() {
  if (transporter) return transporter;
  if (config.smtp.host) {
    mode = 'smtp';
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
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
 * @param {{to:string, cc?:string, subject:string, text:string, html?:string, attachments?:object[]}} msg
 * @returns {Promise<{ok:boolean, mode:string, error?:string}>}
 */
export async function sendMail(msg) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: { name: 'ThinQ Real', address: config.smtp.from },
      to: msg.to,
      cc: msg.cc || undefined,
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
      console.log(`[mail] sent → ${msg.to} subject="${msg.subject}"`);
    }
    return { ok: true, mode };
  } catch (e) {
    console.error('[mail] send error: ' + e.message);
    return { ok: false, mode, error: e.message };
  }
}
