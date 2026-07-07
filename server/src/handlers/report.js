// 월간 리포트 미리보기/수동 발송 — .gs handleMonthlyReportPreview/handleMonthlyReportSend 이식
import { escapeHtml } from '../lib/html.js';
import { sendMonthlyReport } from '../report/send.js';

/** HTML 본문 반환 (메일 미발송) — 라우트가 text/html로 응답.
 *  메일 본문은 <div> 조각이지만, 미리보기는 파일로 저장해 file://로 열 수 있으므로
 *  <meta charset> 포함 완전한 문서로 감싼다 — 없으면 브라우저가 인코딩을 추측해
 *  Safari 등에서 한글이 통째로 깨진다. */
export async function handleMonthlyReportPreview(store, params) {
  const result = await sendMonthlyReport(store, { month: params.month, dryRun: true });
  const html =
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(result.subject) + '</title></head><body style="margin:0;">' +
    result.html +
    '</body></html>';
  return { html, subject: result.subject };
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
