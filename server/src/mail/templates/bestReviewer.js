// 베스트 리뷰어 축하 메일 빌더 — .gs buildBestReviewer* 이식 (인라인 스타일만, Gmail/Outlook 호환)
import { escapeHtml } from '../../lib/html.js';

// 'YYYY-MM' → 'YYYY년 M월'
export function bestMonthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month) || '');
  return m ? m[1] + '년 ' + Number(m[2]) + '월' : String(month);
}

export function buildBestReviewerSubject(month) {
  return '[ThinQ Real] 🏆 ' + bestMonthLabel(month) + ' 베스트 리뷰어로 선정되셨습니다';
}

export function buildBestReviewerText(name, month, product, visitDate) {
  const label = bestMonthLabel(month);
  const lines = [
    '안녕하세요, ' + name + '님.',
    '',
    '남겨주신 방문 후기가 ' + label + ' 베스트 리뷰어 세 분에 선정되었습니다.',
    '정성스러운 후기 감사드립니다 — ThinQ Real 운영 개선에 큰 힘이 됩니다.',
    '',
    '🎁 사은품 안내',
    '   ' + product,
  ];
  if (visitDate) lines.push('   (선정 후기: ' + visitDate + ' 방문)');
  lines.push(
    '',
    '모바일 쿠폰은 이 메일과 별도로 전달드릴 예정입니다.',
    '',
    '앞으로도 ThinQ Real에 많은 관심 부탁드립니다.',
    '감사합니다.',
    'HS플랫폼사업센터 AI홈솔루션엔지니어링팀',
  );
  return lines.join('\n');
}

export function buildBestReviewerHtml(name, month, product, visitDate) {
  const label = bestMonthLabel(month);
  const n = escapeHtml(name);
  const p = escapeHtml(product);
  const v = escapeHtml(visitDate || '');
  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">🏆 ' + escapeHtml(label) + ' 베스트 리뷰어</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:15px;color:#1d1d1f;line-height:1.7;margin-bottom:20px;">' +
            '안녕하세요, <strong>' + n + '</strong>님.<br>' +
            '남겨주신 방문 후기가 <strong style="color:#3a5035;">' + escapeHtml(label) + ' 베스트 리뷰어 세 분</strong>에 선정되었습니다.<br>' +
            '정성스러운 후기 감사드립니다 — ThinQ Real 운영 개선에 큰 힘이 됩니다.' +
          '</div>' +
          '<div style="padding:16px 18px;background:#fdf7ec;border-radius:8px;font-size:14px;line-height:1.7;">' +
            '<div style="font-weight:600;color:#6e5a2e;margin-bottom:4px;">🎁 사은품 안내</div>' +
            '<div style="font-size:15px;font-weight:600;color:#1d1d1f;">' + p + '</div>' +
            (v ? '<div style="color:#6e6e73;font-size:13px;margin-top:2px;">선정 후기: ' + v + ' 방문</div>' : '') +
            '<div style="margin-top:8px;color:#6e5a2e;font-size:13px;">모바일 쿠폰은 이 메일과 별도로 전달드릴 예정입니다.</div>' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '앞으로도 ThinQ Real에 많은 관심 부탁드립니다.<br>' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}
