// 방문 후기 설문 요청 메일 빌더 — .gs buildSurveyInvite* 이식 (인라인 스타일만).
// 설문 링크에 방문일·작성자·소속을 쿼리로 실어 폼이 미리 채우게 한다 (수신자 입력 부담 완화).
import { config } from '../../config.js';
import { escapeHtml } from '../../lib/html.js';

export function buildSurveyInviteLink(b) {
  const params = [];
  if (b.date) params.push('visit_date=' + encodeURIComponent(b.date));
  if (b.name) params.push('name=' + encodeURIComponent(b.name));
  const dept = ((b.division || '') + ' ' + (b.department || '')).trim();
  if (dept) params.push('dept=' + encodeURIComponent(dept));
  return config.surveyFormUrl + (params.length ? '?' + params.join('&') : '');
}

export function buildSurveyInviteSubject() {
  return '[ThinQ Real] 방문 후기 설문 요청 — 소중한 의견을 들려주세요';
}

export function buildSurveyInviteText(b) {
  const link = buildSurveyInviteLink(b);
  return [
    '안녕하세요, ' + (b.name || '') + '님.',
    '',
    'ThinQ Real을 방문해 주셔서 감사합니다.',
    '방문 경험에 대한 짧은 설문을 부탁드립니다. (약 3분 소요)',
    '',
    '📅 방문 정보',
    '   ' + b.date + '  /  ' + (b.slotLabel || ''),
    '   ' + (b.purpose || '') + (b.subject ? ' — ' + b.subject : ''),
    '',
    '📝 설문 작성',
    '   ' + link,
    '   (방문일 등 기본 정보가 미리 채워져 있습니다)',
    '',
    '응답해 주신 내용은 ThinQ Real 운영 개선과 성과 분석에',
    '소중하게 활용됩니다.',
    '',
    '🎁 매월 베스트 리뷰어 세 분을 선정해 소정의 사은품을 드립니다.',
    '',
    '감사합니다.',
    'HS플랫폼사업센터 AI홈솔루션엔지니어링팀',
  ].join('\n');
}

export function buildSurveyInviteHtml(b) {
  const name = escapeHtml(b.name || '');
  const date = escapeHtml(b.date || '');
  const slot = escapeHtml(b.slotLabel || '');
  const purpose = escapeHtml(b.purpose || '');
  const subject = escapeHtml(b.subject || '');
  const link = escapeHtml(buildSurveyInviteLink(b));  // & → &amp; (href 속성 안전)

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">방문 후기를 들려주세요</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:15px;color:#1d1d1f;line-height:1.7;margin-bottom:20px;">' +
            '안녕하세요, <strong>' + name + '</strong>님.<br>' +
            'ThinQ Real을 방문해 주셔서 감사합니다.<br>' +
            '방문 경험에 대한 짧은 설문을 부탁드립니다. <span style="color:#6e6e73;">(약 3분 소요)</span>' +
          '</div>' +
          '<div style="padding:16px 18px;background:#f5f5f7;border-radius:8px;font-size:14px;line-height:1.7;">' +
            '<div style="font-weight:600;color:#3a3a3c;margin-bottom:4px;">📅 방문 정보</div>' +
            '<div style="font-size:15px;font-weight:600;color:#3a5035;">' + date + '</div>' +
            '<div style="color:#6e6e73;font-size:13px;">' + slot + '</div>' +
            (purpose ? '<div style="margin-top:4px;color:#1d1d1f;font-size:13px;">' + purpose + (subject ? ' — ' + subject : '') + '</div>' : '') +
          '</div>' +
          '<div style="text-align:center;margin:28px 0 8px;">' +
            '<a href="' + link + '" style="display:inline-block;background:#3a5035;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">설문 작성하기 (약 3분) ↗</a>' +
            '<div style="color:#aeaeb2;font-size:12px;margin-top:8px;">방문일 등 기본 정보가 미리 채워져 있습니다.</div>' +
          '</div>' +
          '<div style="margin-top:20px;padding:14px 18px;background:#fdf7ec;border-radius:8px;font-size:13px;color:#6e5a2e;line-height:1.6;">' +
            '🎁 매월 <strong>베스트 리뷰어 세 분</strong>을 선정해 소정의 사은품을 드립니다. 구체적인 후기일수록 선정 확률이 올라갑니다.' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '응답해 주신 내용은 ThinQ Real 운영 개선과 성과 분석에 소중하게 활용됩니다.<br>' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}
