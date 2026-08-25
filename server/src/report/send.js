// 월간 리포트 발송 오케스트레이션 — .gs sendMonthlyReport 이식.
// 차트는 내부 렌더링: 미리보기(브라우저) = data: URI, 메일 = cid: 인라인 첨부.
// (외부 이미지 URL이 아니므로 Outlook 외부 이미지 차단의 영향을 받지 않음 —
//  구현부의 Outlook 안내 배너는 cid 전환으로 불필요해져 제거)
import { config } from '../config.js';
import { formatMonthLocal } from '../lib/dates.js';
import { sendMail } from '../mail/mailer.js';
import { buildMonthlyReportText, buildMonthlyReportHtml } from '../mail/templates/monthlyReport.js';
import { collectMonthlyData } from './collect.js';
import { renderPurposeDoughnut } from './charts.js';

/** 데이터 수집 + 차트 렌더링 → { d, charts: {name: Buffer} }
 *  §8-7 개편: 목적 분포 도넛만 사용 (ROI 그래프·가치 도넛은 확정 수치 표기로 대체 폐기).
 *  렌더 실패 시 charts.purpose 없음 → 템플릿이 막대 폴백. */
async function buildReportData(store, month) {
  const d = await collectMonthlyData(store, month);
  const charts = {};
  try {
    const purposeTotal = Object.values(d.purposeCounts).reduce((s, v) => s + v, 0);
    if (purposeTotal > 0) {
      const buf = await renderPurposeDoughnut(d.purposeCounts);
      if (buf) charts.purpose = buf;
    }
  } catch (e) { console.warn('[report] donut render fail → bar fallback: ' + e.message); }
  return { d, charts };
}

/**
 * options: { month?: 'YYYY-MM', dryRun?: bool, to?: string, subjectPrefix?: string, noCc?: bool }
 * subjectPrefix('[테스트] ')·noCc는 §8-6 수동/테스트 발송 전용 — 자동 트리거 경로는 옵션 미전달.
 * dryRun이면 발송 없이 { subject, html(text) } 반환 — 미리보기는 data: URI 임베드.
 */
export async function sendMonthlyReport(store, options = {}) {
  const month = options.month || formatMonthLocal(new Date());
  const to = options.to || config.monthlyReportTo || '';

  const { d, charts } = await buildReportData(store, month);
  const subject = `[ThinQ Real] ${d.year}년 ${d.monthNum}월 운영 리포트`;
  const text = buildMonthlyReportText(d);

  if (options.dryRun) {
    // 브라우저 미리보기 — data: URI로 임베드 (Gmail은 data URI를 제거하므로 미리보기 전용)
    const html = buildMonthlyReportHtml(d, (name) =>
      charts[name] ? `data:image/png;base64,${charts[name].toString('base64')}` : null);
    return { subject, html, text, data: d, sentTo: '' };
  }

  if (!to) {
    console.log('[report] skipped: MONTHLY_REPORT_TO 미설정');
    return { subject, sentTo: '', skipped: 'no recipients' };
  }

  // 메일 발송 — 차트를 cid 인라인 첨부로
  const attachments = Object.entries(charts).map(([name, buf]) => ({
    filename: `${name}.png`,
    content: buf,
    cid: `chart-${name}@thinqreal`,
    contentDisposition: 'inline',
  }));
  const html = buildMonthlyReportHtml(d, (name) => (charts[name] ? `cid:chart-${name}@thinqreal` : null));

  const finalSubject = (options.subjectPrefix || '') + subject;
  const result = await sendMail({
    to, cc: options.noCc ? undefined : config.adminAlertCc,
    subject: finalSubject, text, html, attachments,
  });
  if (!result.ok) return { subject: finalSubject, sentTo: '', error: result.error };
  console.log(`[report] sent → ${to} (${month})`);
  return { subject: finalSubject, sentTo: to };
}
