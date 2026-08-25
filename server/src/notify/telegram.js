// 텔레그램 알림 — 과도기 유지 (Teams 안정화 후 제거 예정, decisions §2-⑦).
// env 미설정 시 silent skip. 실패는 try/catch 격리 — 예약 저장·메일에 영향 없음.
import { config } from '../config.js';
import { escapeTelegramHtml as esc } from '../lib/html.js';
import { SUBJ_LABELS } from '../lib/constants.js';
import { normalizeDate } from '../lib/dates.js';

export function telegramConfigured() {
  return !!(config.telegram.token && config.telegram.chatId);
}

export async function sendTelegramMessage(text) {
  try {
    if (config.outboundSuppressed) {
      console.log(`[telegram] ENVIRONMENT=${config.environment} 비운영 환경 → 발송 억제`);
      return { ok: false, reason: 'suppressed_env' };
    }
    if (!telegramConfigured()) {
      console.log('[telegram] skip — token or chat_id not set');
      return { ok: false, reason: 'not_configured' };
    }
    const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    console.warn(`[telegram] HTTP ${res.status} ${body}`);
    return { ok: false, reason: 'http_' + res.status, body };
  } catch (e) {
    console.warn('[telegram] error ' + e.message);
    return { ok: false, reason: 'exception' };
  }
}

export function buildNewBookingMessage(data, id) {
  const slotLabel = data.slotLabel || (data.slot ? data.slot + '회차' : '');
  const subjLabel = SUBJ_LABELS[data.purposeKey] || '제목';
  const subject = data.subject || data.org || '';
  const company = data.clientCompany || '';
  const count = data.count || '';
  const belong = [data.division, data.department].filter(Boolean).join(' · ');

  const lines = [];
  lines.push('🆕 <b>새 예약 신청</b>');
  lines.push('');
  lines.push('📅 ' + esc(data.date) + '  ' + esc(slotLabel));
  lines.push('🎯 ' + esc(data.purpose));
  if (subject) lines.push('📝 ' + esc(subjLabel) + ': ' + esc(subject));
  if (company) lines.push('🏢 ' + esc(company));
  lines.push('👤 ' + esc(data.name) + (count ? '  ·  총 ' + esc(count) + '명' : ''));
  if (belong) lines.push('🏛 ' + esc(belong));
  if (data.phone) lines.push('☎ ' + esc(data.phone));
  lines.push('');
  lines.push(`<a href="${config.adminPageUrl}">관리자 페이지에서 승인/거절</a>`);
  return lines.join('\n');
}

// 설문 접수 알림 — .gs sendTelegramSurvey 이식
export function buildSurveyMessage(data, track, ledgerCount, issueCount) {
  const trackLabel = { sales: 'B2B 영업', media: '콘텐츠·홍보', etc: 'R&D·내부·기타' }[track] || track;
  const lines = [];
  lines.push('📝 <b>설문 접수</b> [' + esc(trackLabel) + ']');
  lines.push('');
  lines.push('📅 방문일 ' + esc(data.visit_date || '-') + (data.visit_count ? ' · ' + esc(data.visit_count) : ''));
  lines.push('👤 ' + esc(data.name || '-') + ' (' + esc(data.dept || '-') + ')');
  if (data.satisfaction) lines.push('⭐ ' + esc(data.satisfaction));
  if (ledgerCount) lines.push('📒 성과 추적 대장 +' + ledgerCount + '건 (후보)');
  if (issueCount) lines.push('⚠ IoT 이슈 로그 +' + issueCount + '건');
  return lines.join('\n');
}

export function buildStatusChangeMessage(booking, status) {
  const date = normalizeDate(booking.date);
  const slotLabel = booking.slotLabel || '';
  const purpose = booking.purpose || '';
  const subject = booking.subject || booking.org || '';
  const name = booking.name || '';

  let header;
  if (status === '확정') header = '✅ <b>예약 확정</b>';
  else if (status === '거절') header = '❌ <b>예약 거절</b>';
  else header = 'ℹ️ <b>상태 변경</b> — ' + esc(status);

  const lines = [header, ''];
  lines.push('📅 ' + esc(date) + '  ' + esc(slotLabel));
  if (purpose) lines.push('🎯 ' + esc(purpose));
  if (subject) lines.push('📝 ' + esc(subject));
  if (name) lines.push('👤 ' + esc(name));
  return lines.join('\n');
}
