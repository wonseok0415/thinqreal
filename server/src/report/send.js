// 월간 리포트 발송 오케스트레이션 — .gs sendMonthlyReport 이식.
// 차트는 내부 렌더링: 미리보기(브라우저) = data: URI, 메일 = cid: 인라인 첨부.
// (외부 이미지 URL이 아니므로 Outlook 외부 이미지 차단의 영향을 받지 않음 —
//  구현부의 Outlook 안내 배너는 cid 전환으로 불필요해져 제거)
import { config } from '../config.js';
import { formatMonthLocal } from '../lib/dates.js';
import { sendMail } from '../mail/mailer.js';
import { buildMonthlyReportText, buildMonthlyReportHtml } from '../mail/templates/monthlyReport.js';
import { collectMonthlyData } from './collect.js';
import { renderPurposeDoughnut, renderRoiValueDoughnut, renderCumulativeLine } from './charts.js';

/** 데이터 수집 + 차트 렌더링 → { d, charts: {name: Buffer} } */
async function buildReportData(store, month) {
  const d = await collectMonthlyData(store, month);
  const charts = {};

  const purposeTotal = Object.values(d.purposeCounts).reduce((s, v) => s + v, 0);
  if (purposeTotal > 0) {
    const buf = await renderPurposeDoughnut(d.purposeCounts);
    if (buf) charts.purpose = buf;
  }
  if (d.roiLatest) {
    const o = d.roiLatest.outputs || {};
    const annualValue = Number(o.annualValue) || 0;
    const totalCost = Number(o.totalCost) || (annualValue * 3 - (Number(o.profit3) || 0));
    const vBuf = await renderRoiValueDoughnut(o);
    if (vBuf) charts.roiValue = vBuf;
    const cBuf = await renderCumulativeLine(totalCost, annualValue);
    if (cBuf) charts.cumulative = cBuf;
  }
  return { d, charts };
}

/**
 * options: { month?: 'YYYY-MM', dryRun?: bool, to?: string }
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

  const result = await sendMail({ to, cc: config.adminAlertCc, subject, text, html, attachments });
  if (!result.ok) return { subject, sentTo: '', error: result.error };
  console.log(`[report] sent → ${to} (${month})`);
  return { subject, sentTo: to };
}
