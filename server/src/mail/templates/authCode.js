// 인증 코드 메일 — .gs buildAuthCodeText/Html 이식 (인라인 스타일만, Outlook/Gmail 호환)
import { escapeHtml } from '../../lib/html.js';

export function buildAuthCodeText(code) {
  return [
    'ThinQ Real 사이트 접속 인증',
    '',
    '인증 코드: ' + code,
    '',
    '이 코드를 사이트 인증 화면에 입력하세요.',
    '코드는 20분간 유효합니다.',
    '',
    '※ 사내 메일 보안 검역으로 메일 도착이 지연될 수 있습니다.',
    '   메일이 늦게 도착해도 받으신 코드를 그대로 입력해 주세요.',
    '',
    '본인이 요청하지 않았다면 이 메일은 무시하세요.',
    '',
    '— ThinQ Real (HS플랫폼사업센터 AI홈솔루션엔지니어링팀)',
  ].join('\n');
}

export function buildAuthCodeHtml(code) {
  return '' +
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#f5f5f7;padding:24px 16px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;padding:22px 28px;color:#ffffff;font-size:17px;font-weight:600;">' +
          'ThinQ Real 접속 인증' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<div style="font-size:14px;color:#6e6e73;margin-bottom:8px;">아래 6자리 코드를 인증 화면에 입력하세요.</div>' +
          '<div style="font-size:38px;font-weight:700;letter-spacing:8px;color:#1d1d1f;background:#f5f5f7;border-radius:10px;text-align:center;padding:18px 0;margin:8px 0 18px;">' +
            escapeHtml(code) +
          '</div>' +
          '<div style="font-size:13px;color:#6e6e73;line-height:1.55;">' +
            '· 코드는 <strong>20분간</strong> 유효합니다.<br>' +
            '· 본인이 요청하지 않았다면 이 메일은 무시하세요.' +
          '</div>' +
          '<div style="margin-top:14px;padding:12px 14px;background:#fafafa;border-left:3px solid #8fa889;border-radius:4px;font-size:12px;color:#6e6e73;line-height:1.6;">' +
            '※ 사내 메일 보안 검역으로 메일 도착이 지연될 수 있습니다. ' +
            '메일이 늦게 도착해도 받으신 코드를 그대로 입력해 주세요.' +
          '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:14px 28px 22px;border-top:1px solid #e8e8ed;font-size:12px;color:#aeaeb2;">' +
          'ThinQ Real · HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
        '</td></tr>' +
      '</table>' +
    '</div>';
}
