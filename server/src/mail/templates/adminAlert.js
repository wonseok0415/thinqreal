// 담당자 알림 메일 (신규 예약 접수) — .gs buildAdminAlertText/Html 이식.
// 다크 올리브 카드형, 인라인 스타일만 (Gmail/Outlook 호환).
import { SUBJ_LABELS } from '../../lib/constants.js';
import { escapeHtml } from '../../lib/html.js';
import { config } from '../../config.js';

export function buildAdminAlertText(data, id) {
  const subjLabel = SUBJ_LABELS[data.purposeKey] || '제목';

  let visitorsLines = '';
  try {
    const vs = JSON.parse(data.visitors || '[]');
    if (vs.length) {
      visitorsLines = '\n  방문자  :\n' + vs.map((v, i) => {
        const parts = [v.org, v.name, v.rank].filter(Boolean).join(' / ');
        return '            ' + String(i + 1).padStart(2, ' ') + '. ' + parts;
      }).join('\n');
    }
  } catch { /* visitors 파싱 실패 시 명단 생략 */ }

  return `
새로운 예약 신청이 접수되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  예약 ID : ${id}
  날  짜  : ${data.date}
  회  차  : ${data.slotLabel || ''}
  목  적  : ${data.purpose}
  ${subjLabel.padEnd(7, ' ')}: ${data.subject || data.org || ''}
  책임자  : ${data.name}
  소  속  : ${[data.division, data.department].filter(Boolean).join(' · ')}
  연락처  : ${data.phone}
  이메일  : ${data.email}
  인  원  : ${data.count}명${visitorsLines}

  활용 방안 :
${(data.usagePlan || '').split('\n').map((l) => '    ' + l).join('\n')}

  기대 효과 :
${(data.expectedEffect || '').split('\n').map((l) => '    ' + l).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

관리자 페이지에서 승인 또는 거절해 주세요.
${config.adminPageUrl}
  `.trim();
}

export function buildAdminAlertHtml(data, id) {
  const subjLabel = SUBJ_LABELS[data.purposeKey] || '제목';
  const date = escapeHtml(data.date);
  const slot = escapeHtml(data.slotLabel || '');
  const purpose = escapeHtml(data.purpose || '');
  const subjVal = escapeHtml(data.subject || data.org || '');
  const client = escapeHtml(data.clientCompany || '');
  const name = escapeHtml(data.name || '');
  const belong = escapeHtml([data.division, data.department].filter(Boolean).join(' · '));
  const phone = escapeHtml(data.phone || '');
  const email = escapeHtml(data.email || '');
  const count = escapeHtml(String(data.count || ''));
  const usage = String(data.usagePlan || '').trim();
  const effect = String(data.expectedEffect || '').trim();

  let visitorsHtml = '';
  try {
    const vs = JSON.parse(data.visitors || '[]');
    if (vs.length) {
      const rows = vs.map((v, i) => {
        const idx = String(i + 1).padStart(2, '0');
        const parts = [v.org, v.name, v.rank].filter(Boolean).map(escapeHtml);
        const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
        return (
          '<tr style="background:' + bg + ';">' +
            '<td style="padding:6px 10px;font-size:12px;color:#aeaeb2;font-variant-numeric:tabular-nums;width:32px;text-align:right;">' + idx + '</td>' +
            '<td style="padding:6px 12px;font-size:13px;color:#1d1d1f;">' + parts.join(' <span style="color:#c7c7cc;">·</span> ') + '</td>' +
          '</tr>'
        );
      }).join('');
      visitorsHtml =
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #eeeeee;border-radius:6px;overflow:hidden;margin-top:6px;">' +
          '<tbody>' + rows + '</tbody>' +
        '</table>';
    }
  } catch { /* visitors 파싱 실패 시 명단 생략 */ }

  const multiline = (s) => escapeHtml(s).replace(/\n/g, '<br>');
  const blockBox = (text) =>
    '<div style="margin-top:6px;padding:12px 14px;background:#f5f5f7;border-left:3px solid #8fa889;border-radius:4px;font-size:13px;color:#1d1d1f;line-height:1.7;">' +
      (text ? multiline(text) : '<span style="color:#aeaeb2;">(작성된 내용 없음)</span>') +
    '</div>';

  const infoRow = (icon, label, valueHtml) =>
    '<tr>' +
      '<td valign="top" style="padding:14px 12px 14px 0;width:96px;font-size:13px;color:#6e6e73;font-weight:600;white-space:nowrap;">' + icon + '&nbsp;' + label + '</td>' +
      '<td valign="top" style="padding:14px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">' + valueHtml + '</td>' +
    '</tr>';

  let rows =
    infoRow('📅', '일정',
      '<div style="font-size:16px;font-weight:600;color:#3a5035;">' + date + '</div>' +
      '<div style="color:#6e6e73;font-size:13px;">' + slot + '</div>') +
    infoRow('🎯', '목적', purpose) +
    infoRow('📝', subjLabel, subjVal || '<span style="color:#aeaeb2;">—</span>');

  if (client) {
    rows += infoRow('🏢', '고객사', client);
  }

  rows +=
    infoRow('👤', '책임자', name) +
    infoRow('🏛', '소속', belong || '<span style="color:#aeaeb2;">—</span>') +
    infoRow('☎', '연락처',
      '<div>' + phone + '</div>' +
      '<div style="color:#6e6e73;font-size:13px;"><a href="mailto:' + email + '" style="color:#3a5035;text-decoration:none;">' + email + '</a></div>') +
    infoRow('👥', '인원',
      '<div style="font-size:15px;font-weight:600;">' + count + '명</div>' +
      visitorsHtml) +
    infoRow('💡', '활용 방안', blockBox(usage)) +
    infoRow('✨', '기대 효과', blockBox(effect));

  return (
    '<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:collapse;max-width:680px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">' +
        '<tr><td style="background:#3a5035;color:#ffffff;padding:24px 28px;">' +
          '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">ThinQ Real</div>' +
          '<div style="font-size:20px;font-weight:600;margin-top:4px;">새 예약 신청이 접수되었습니다</div>' +
          '<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:8px;font-variant-numeric:tabular-nums;">예약 ID · ' + escapeHtml(String(id)) + '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' +
          '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;border-top:1px solid #eeeeee;">' +
            rows +
          '</table>' +
          '<div style="margin-top:28px;text-align:center;">' +
            '<a href="' + escapeHtml(config.adminPageUrl) + '" style="display:inline-block;background:#3a5035;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">관리자 페이지에서 승인 / 거절하기 ↗</a>' +
          '</div>' +
          '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #eeeeee;font-size:13px;color:#6e6e73;line-height:1.6;">' +
            '감사합니다.<br>HS플랫폼사업센터 AI홈솔루션엔지니어링팀' +
          '</div>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}
