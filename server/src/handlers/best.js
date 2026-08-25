// 베스트 리뷰어 사은품 발송 (2026-08-22) — .gs handleBestReviewerSend 이식.
// - 설문 요청 메일의 「매월 베스트 리뷰어 세 분」 공지 이행 — 관리자 설문 탭에서 선정·발송.
// - 축하 메일만 발송 — 기프티콘(모바일 쿠폰)은 별도 채널로 전달 (금전 가치물은 시스템 미경유).
// - 가드: 같은 응답 재발송 차단 / 같은 달 3명(BEST_MONTHLY_LIMIT) 초과 차단.
// - 메일 발송이 본질 — 발송 성공 후에만 이력 기록 (실패 시 기록 없음 → 재시도 가능).
import { config } from '../config.js';
import { BEST_MONTHLY_LIMIT, BEST_DEFAULT_PRODUCT } from '../lib/constants.js';
import { normalizeMonth } from '../lib/dates.js';
import { sendMail } from '../mail/mailer.js';
import {
  buildBestReviewerSubject, buildBestReviewerText, buildBestReviewerHtml,
} from '../mail/templates/bestReviewer.js';

export async function handleBestReviewerSend(store, data, adminEmail) {
  const month = String(data.month || '');
  const responseId = String(data.responseId || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const name = String(data.name || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !responseId || !name) {
    return { ok: false, error: 'invalid_input' };
  }
  // 수신 대상은 설문 초대와 동일하게 @lge.com 한정 (사내 리워드)
  if (!/^[a-z0-9._%+-]+@lge\.com$/.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }
  const rows = await store.best.list();
  if (rows.some((r) => String(r.response_id) === responseId)) {
    return { ok: false, error: 'already_sent' };
  }
  const monthCount = rows.filter((r) => normalizeMonth(r.month) === month).length;
  if (monthCount >= BEST_MONTHLY_LIMIT) {
    return { ok: false, error: 'limit_reached' };
  }
  const product = String(data.product || '').trim() || BEST_DEFAULT_PRODUCT;
  const visitDate = String(data.visitDate || '').trim();

  const result = await sendMail({
    to: email,
    bcc: config.bestReviewerBcc,
    subject: buildBestReviewerSubject(month),
    text: buildBestReviewerText(name, month, product, visitDate),
    html: buildBestReviewerHtml(name, month, product, visitDate),
  });
  if (!result.ok) return { ok: false, error: 'mail_failed', detail: result.error };

  await store.best.append({
    id: String(Date.now()), month, response_id: responseId, name,
    dept: String(data.dept || ''), email, visit_date: visitDate, product,
    sent_at: new Date().toISOString(), sent_by: String(adminEmail || ''),
  });
  console.log('[best] reviewer mail sent → ' + email + ' (' + month + ')');
  return { ok: true };
}
