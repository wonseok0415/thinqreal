// 월간 리포트 미리보기/수동 발송 — .gs handleMonthlyReportPreview/handleMonthlyReportSend 이식
import { sendMonthlyReport } from '../report/send.js';

/** HTML 본문 반환 (메일 미발송) — 라우트가 text/html로 응답 */
export async function handleMonthlyReportPreview(store, params) {
  const result = await sendMonthlyReport(store, { month: params.month, dryRun: true });
  return { html: result.html, subject: result.subject };
}

/** confirm=YES 없으면 가드로 미발송 (실수 발송 방지) */
export async function handleMonthlyReportSend(store, params) {
  if (params.confirm !== 'YES') {
    const result = await sendMonthlyReport(store, { month: params.month, dryRun: true });
    return {
      success: false,
      hint: '실제 발송하려면 동일 URL에 &confirm=YES 를 추가하세요.',
      previewSubject: result.subject,
    };
  }
  const result = await sendMonthlyReport(store, { month: params.month, to: params.to });
  return { success: true, subject: result.subject, sentTo: result.sentTo || '(skipped)' };
}
